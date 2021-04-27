'use strict';

const cookie = require('cookie');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const untildify = require('untildify');
const tail = require('./lib/tail');
const connectBuilder = require('./lib/connect_builder');
const program = require('./lib/options_parser');
const serverBuilder = require('./lib/server_builder');
const daemonize = require('./lib/daemonize');
const usageStats = require('./lib/stats');

/**
 * Parse args
 */
program.parse(process.argv);
if (program.args.length === 0) {
  console.error('Arguments needed, use --help');
  process.exit();
}

/**
 * Init usage statistics
 */
const stats = usageStats(!program.disableUsageStats, program);
stats.track('runtime', 'init');
stats.time('runtime', 'runtime');

/**
 * Validate params
 */
const doAuthorization = !!(program.user && program.password);
const doSecure = !!(program.key && program.certificate);
const sessionSecret = String(+new Date()) + Math.random();
const files = program.args.join(' ');
const filesNamespace = crypto.createHash('md5').update(files).digest('hex');
const urlPath = program.urlPath.replace(/\/$/, ''); // remove trailing slash

if (program.daemonize) {
  // __filename is nodejs global variable to get current file name
  // program has all the user passed args
  daemonize(__filename, program, {
    doAuthorization,
    doSecure,
  });
} else {
  /**
   * HTTP(s) server setup
   */
  const appBuilder = connectBuilder(urlPath);
  if (doAuthorization) {
    appBuilder.session(sessionSecret);
    appBuilder.authorize(program.user, program.password);
  }
  appBuilder
    .static(path.join(__dirname, 'web', 'assets'))
    .index(
      path.join(__dirname, 'web', 'index.html'),
      files,
      filesNamespace,
      program.theme
    );

  const builder = serverBuilder();
  if (doSecure) {
    builder.secure(program.key, program.certificate);
  }
  const server = builder
    .use(appBuilder.build())
    .port(program.port)
    .host(program.host)
    .build();

  /**
   * socket.io setup
   */
  const io = new Server({ path: `${urlPath}/socket.io` });
  io.attach(server);

  if (doAuthorization) {
    io.use((socket, next) => {
      const handshakeData = socket.request;
      if (handshakeData.headers.cookie) {
        const cookies = cookie.parse(handshakeData.headers.cookie);
        const sessionIdEncoded = cookies['connect.sid'];
        if (!sessionIdEncoded) {
          return next(new Error('Session cookie not provided'), false);
        }
        const sessionId = cookieParser.signedCookie(
          sessionIdEncoded,
          sessionSecret
        );
        if (sessionId) {
          return next(null);
        }
        return next(new Error('Invalid cookie'), false);
      }

      return next(new Error('No cookie in header'), false);
    });
  }

  /**
   * Setup UI highlights
   */
  let highlightConfig;
  if (program.uiHighlight) {
    let presetPath;

    if (!program.uiHighlightPreset) {
      presetPath = path.join(__dirname, 'preset', 'default.json');
    } else {
      presetPath = path.resolve(untildify(program.uiHighlightPreset));
    }

    if (fs.existsSync(presetPath)) {
      highlightConfig = JSON.parse(fs.readFileSync(presetPath));
    } else {
      throw new Error(`Preset file ${presetPath} doesn't exists`);
    }
  }

  /**
   * When connected send starting data
   */
  const tailer = tail(program.args, {
    // number is the number of starting lines
    // later, the number is not required when stream starts
    buffer: program.number,
  });

  // filesSocket is a socket just for one namespace
  // A Namespace is a communication channel that allows you to split the logic of your application over a single shared connection (also called “multiplexing”).
  // https://socket.io/docs/v3/namespaces/index.html
  // *of* handles namespacing
  // io is attached the default localhost server
  const filesSocket = io.of(`/${filesNamespace}`).on('connection', (socket) => {
    // emit the option *lines*: number of lines to be stored on browser
    socket.emit('options:lines', program.lines);

    if (program.uiHideTopbar) {
      socket.emit('options:hide-topbar');
    }

    if (!program.uiIndent) {
      socket.emit('options:no-indent');
    }

    if (program.uiHighlight) {
      socket.emit('options:highlightConfig', highlightConfig);
    }

    // emits the actual line from buffer using the file socket
    // the buffer in tail is already configured to hold only 10 or such number of specified lines
    tailer.getBuffer().forEach((line) => {
      socket.emit('line', line);
    });
  });

  /**
   * Send incoming data
   */
  /*
  All objects that emit events are instances of the EventEmitter class.
  These objects expose an eventEmitter.on() function
    that allows one or more functions to be attached to named events emitted by the object.
  Typically, event names are camel-cased strings but any valid JavaScript property key can be used.
  */
  // tailer in an instance of EventEmitter
  // tailer uses *on* to attach listeners (i.e. callbacks) for *line* event
  // when *line* event is emitted by 'tail.js', the listener is triggered
  // the listener uses filesSocket to emit *line* event in the below case
  // emits from filesSocket seem to be listened to by the browser
  // *io* establishes a perpetual connection between the client and the server
  // hence, the emits from server are received by the client
  // https://stackoverflow.com/questions/48332454/how-does-socket-io-on-the-client-listen-to-events-emitted-from-server
  tailer.on('line', (line) => {
    filesSocket.emit('line', line);
  });

  stats.track('runtime', 'started');

  /**
   * Handle signals
   */
  const cleanExit = () => {
    stats.timeEnd('runtime', 'runtime', () => {
      process.exit();
    });
  };
  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);
}
