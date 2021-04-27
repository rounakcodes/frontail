/* eslint no-underscore-dangle: off */

'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');

function ServerBuilder() {
  this._host = null;
  this._port = 9001;
}

ServerBuilder.prototype.build = function build() {
  /*
    http module is basically the implementation of the http protocol

    To use the HTTP server and client one must require('http').
    The HTTP interfaces in Node.js are designed to support many features of the protocol
      which have been traditionally difficult to use.
    In particular, large, possibly chunk-encoded, messages.
    The interface is careful to never buffer entire requests or responses,
      so the user is able to stream data.
  */
  if (this._key && this._cert) {
    const options = {
      key: this._key,
      cert: this._cert,
    };
    return https
      .createServer(options, this._callback)
      .listen(this._port, this._host);
  }

  return http.createServer(this._callback).listen(this._port, this._host);
};

ServerBuilder.prototype.host = function hostf(host) {
  this._host = host;
  return this;
};

ServerBuilder.prototype.port = function portf(port) {
  this._port = port;
  return this;
};

ServerBuilder.prototype.secure = function secure(keyPath, certPath) {
  try {
    this._key = fs.readFileSync(keyPath);
    this._cert = fs.readFileSync(certPath);
  } catch (e) {
    throw new Error('No key or certificate file found');
  }

  return this;
};

ServerBuilder.prototype.use = function use(callback) {
  this._callback = callback;
  return this;
};

module.exports = () => new ServerBuilder();
