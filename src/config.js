const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PROFILE = 'default';
const DEFAULT_BASE_URL = 'http://localhost:3000';

function getConfigDir(env = process.env) {
  const xdg = typeof env.XDG_CONFIG_HOME === 'string' ? env.XDG_CONFIG_HOME.trim() : '';
  if (xdg) return path.join(xdg, 'filter');
  return path.join(os.homedir(), '.config', 'filter');
}

function getConfigPath(env = process.env) {
  return path.join(getConfigDir(env), 'config.json');
}

function createEmptyConfig() {
  return {
    defaultProfile: DEFAULT_PROFILE,
    profiles: {},
  };
}

function normalizeConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {};
  const profiles = config.profiles && typeof config.profiles === 'object' ? config.profiles : {};
  const normalizedProfiles = {};

  for (const [name, profile] of Object.entries(profiles)) {
    if (!profile || typeof profile !== 'object') continue;
    normalizedProfiles[name] = {
      baseUrl: typeof profile.baseUrl === 'string' ? profile.baseUrl.trim() : '',
      token: typeof profile.token === 'string' ? profile.token.trim() : '',
    };
  }

  return {
    defaultProfile:
      typeof config.defaultProfile === 'string' && config.defaultProfile.trim()
        ? config.defaultProfile.trim()
        : DEFAULT_PROFILE,
    profiles: normalizedProfiles,
  };
}

function readConfig(env = process.env) {
  const configPath = getConfigPath(env);
  if (!fs.existsSync(configPath)) return createEmptyConfig();

  const raw = fs.readFileSync(configPath, 'utf8');
  return normalizeConfig(JSON.parse(raw));
}

function writeConfig(config, env = process.env) {
  const configPath = getConfigPath(env);
  fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath, `${JSON.stringify(normalizeConfig(config), null, 2)}\n`, {
    mode: 0o600,
  });
  fs.chmodSync(configPath, 0o600);
  return configPath;
}

function saveProfile(profileName, values, env = process.env) {
  const config = readConfig(env);
  const name = String(profileName || config.defaultProfile || DEFAULT_PROFILE).trim() || DEFAULT_PROFILE;
  const current = config.profiles[name] || {};

  config.profiles[name] = {
    baseUrl:
      typeof values.baseUrl === 'string' && values.baseUrl.trim()
        ? values.baseUrl.trim()
        : current.baseUrl || '',
    token:
      typeof values.token === 'string' && values.token.trim()
        ? values.token.trim()
        : current.token || '',
  };

  if (!config.defaultProfile) config.defaultProfile = name;
  const configPath = writeConfig(config, env);

  return {
    configPath,
    profileName: name,
    profile: config.profiles[name],
  };
}

function clearProfileToken(profileName, env = process.env) {
  const config = readConfig(env);
  const name = String(profileName || config.defaultProfile || DEFAULT_PROFILE).trim() || DEFAULT_PROFILE;
  const current = config.profiles[name] || {};

  config.profiles[name] = {
    ...current,
    token: '',
  };

  const configPath = writeConfig(config, env);
  return {
    configPath,
    profileName: name,
    profile: config.profiles[name],
  };
}

function resolveProfileName({ flags = {}, env = process.env, config = null } = {}) {
  if (typeof flags.profile === 'string' && flags.profile.trim()) return flags.profile.trim();
  if (typeof env.FILTER_PROFILE === 'string' && env.FILTER_PROFILE.trim()) return env.FILTER_PROFILE.trim();
  return (config || readConfig(env)).defaultProfile || DEFAULT_PROFILE;
}

function resolveRuntimeConfig({ flags = {}, env = process.env } = {}) {
  const config = readConfig(env);
  const profileName = resolveProfileName({ flags, env, config });
  const profile = config.profiles[profileName] || {};
  const baseUrl =
    (typeof flags.baseUrl === 'string' && flags.baseUrl.trim()) ||
    (typeof env.FILTER_API_BASE_URL === 'string' && env.FILTER_API_BASE_URL.trim()) ||
    profile.baseUrl ||
    DEFAULT_BASE_URL;
  const token =
    (typeof flags.token === 'string' && flags.token.trim()) ||
    (typeof env.FILTER_API_TOKEN === 'string' && env.FILTER_API_TOKEN.trim()) ||
    profile.token ||
    '';

  return {
    baseUrl,
    token,
    profileName,
    configPath: getConfigPath(env),
    profile,
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_PROFILE,
  clearProfileToken,
  getConfigPath,
  readConfig,
  resolveRuntimeConfig,
  saveProfile,
};
