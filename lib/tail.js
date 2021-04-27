/* eslint no-underscore-dangle: off */

'use strict';

const events = require('events');
const childProcess = require('child_process');
const tailStream = require('fs-tail-stream');
const util = require('util');
const CBuffer = require('CBuffer');
const byline = require('byline');
const commandExistsSync = require('command-exists').sync;

function Tail(path, opts) {
  events.EventEmitter.call(this);

  const options = opts || {
    buffer: 0,
  };
  /*
    CBuffer:
    The end goal of this project is to implement the entire JavaScript Array.prototype, and some additional utility methods, as a circular buffer, a ring buffer structure.
Note: This is called a circular buffer because of what this library accomplishes, but is implemented as an Array. This may be confusing for Node users, which may want to use a true Buffer.
While the entire Array.prototype API is on the roadmap, it's not all quite here. Below is the currently implemented API.

circular buffer:
In computer science, a circular buffer, circular queue, cyclic buffer or ring buffer is a data structure that uses a single, fixed-size buffer as if it were connected end-to-end. This structure lends itself easily to buffering data streams.

meaning of buffer:
Imagine that you're eating candy out of a bowl.
You take one piece regularly.
To prevent the bowl from running out,
someone might refill the bowl before it gets empty,
so that when you want to take another piece,
there's candy in the bowl.
The bowl acts as a buffer between you and the candy bag.
If you're watching a movie online, the web service will continually download the next 5 minutes or so into a buffer,
that way your computer doesn't have to download the movie as you're watching it (which would cause hanging).

Buffers are required when producers and consumers operate at different rates.
Candy is made in large batches but consumed in smaller quantities
  */
  this._buffer = new CBuffer(options.buffer);

  let stream;

  if (path[0] === '-') {
    stream = process.stdin;
  } else {
    /* Check if this os provides the `tail` command. */
    const hasTailCommand = commandExistsSync('tail');
    if (hasTailCommand) {
      let followOpt = '-F';
      if (process.platform === 'openbsd') {
        followOpt = '-f';
      }

      const cp = childProcess.spawn(
        'tail',
        ['-n', options.buffer, followOpt].concat(path)
      );
      cp.stderr.on('data', (data) => {
        // If there is any important error then display it in the console. Tail will keep running.
        // File can be truncated over network.
        if (data.toString().indexOf('file truncated') === -1) {
          console.error(data.toString());
        }
      });
      // output of tail command
      stream = cp.stdout;

      process.on('exit', () => {
        cp.kill();
      });
    } else {
      /* This is used if the os does not support the `tail`command. */

      /*
        The built in fs.createReadStream function stops streaming once the file has come to an end.
If you want to tail the file so that it keeps streaming data when the file grows then you're out of luck.
This module adds a { tail: true } option to the options which will keep streaming data as data is added to the file,
  or until the .close() method is called on the read stream.
Because this module wraps the underlying fs.createReadStream function all the options work as expected.
      */
      stream = tailStream.createReadStream(path.join(), {
        encoding: 'utf8',
        start: options.buffer,
        tail: true,
      });
    }
  }

  /*
    byline — buffered stream for reading lines
  */
  byline(stream, { keepEmptyLines: true }).on('data', (line) => {
    const str = line.toString();
    this._buffer.push(str);
    this.emit('line', str);
  });
}
util.inherits(Tail, events.EventEmitter);

Tail.prototype.getBuffer = function getBuffer() {
  return this._buffer.toArray();
};

module.exports = (path, options) => new Tail(path, options);
