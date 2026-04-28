const readline = require('node:readline');

function prompt(question, { stream = process.stderr, input = process.stdin } = {}) {
  if (!input.isTTY) {
    return Promise.reject(
      new Error('Cannot prompt for input: stdin is not a TTY. Pass the value as a flag instead.')
    );
  }

  const rl = readline.createInterface({ input, output: stream, terminal: true });
  return new Promise((resolve, reject) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('Cancelled.'));
    });
  });
}

module.exports = { prompt };
