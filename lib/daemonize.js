'use strict';

const daemon = require('daemon-fix41');
const fs = require('fs');

const defaultOptions = {
  doAuthorization: false,
  doSecure: false,
};

module.exports = (script, params, opts) => {
  const options = opts || defaultOptions;

  const logFile = fs.openSync(params.logPath, 'a');

  let args = [
    '-h',
    params.host,
    '-p',
    params.port,
    '-n',
    params.number,
    '-l',
    params.lines,
    '-t',
    params.theme,
  ];

  if (options.doAuthorization) {
    args.push('-U', params.user, '-P', params.password);
  }

  if (options.doSecure) {
    args.push('-k', params.key, '-c', params.certificate);
  }

  if (params.uiHideTopbar) {
    args.push('--ui-hide-topbar');
  }

  if (params.urlPath) {
    args.push('--url-path', params.urlPath);
  }

  if (!params.uiIndent) {
    args.push('--ui-no-indent');
  }

  if (params.uiHighlight) {
    args.push('--ui-highlight');
  }

  if (params.uiHighlightPreset) {
    args.push('--ui-highlight-preset', params.uiHighlightPreset);
  }

  if (params.disableUsageStats) {
    args.push('--disable-usage-stats', params.disableUsageStats);
  }

  args = args.concat(params.args);

  /*
  daemon
  Turn a node script into a daemon.

daemon.daemon(script, args, opt)
Spawn the script with given args array as a daemonized process. Return the child process object.
  */
  const proc = daemon.daemon(script, args, {
    stdout: logFile,
    stderr: logFile,
  });

  // fs.writeFileSync( file, data, options )
  /*
  file: It is a string, Buffer, URL or file description integer that denotes the path of the file where it has to be written.
  data: It is a string, Buffer, TypedArray or DataView that will be written to the file.
  */
  fs.writeFileSync(params.pidPath, proc.pid);
};
