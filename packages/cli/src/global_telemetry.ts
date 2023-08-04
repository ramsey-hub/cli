import 'dotenv/config'
import * as Rollbar from 'rollbar'
const { Resource } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");
const { registerInstrumentations } = require("@opentelemetry/instrumentation");
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
const { BatchSpanProcessor } = require("@opentelemetry/sdk-trace-base");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const opentelemetry = require('@opentelemetry/api');
const isDev = process.env.IS_DEV_ENVIRONMENT === 'true'

const debug = require('debug')('global_telemetry')
const rollbar = new Rollbar({
  accessToken: '41f8730238814af69c248e2f7ca59ff2',
  captureUncaught: true,
  captureUnhandledRejections: true,
  environment: isDev ? 'development' : 'production',
})

registerInstrumentations({
  instrumentations: [],
});

const resource =
  Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "heroku-cli",
    })
  );

const provider = new NodeTracerProvider({
    resource: resource,
});

// need to get auth token
const token = ''
const devHeaders = {
        "x-honeycomb-team": process.env.HONEYCOMB_API_KEY,
        "x-honeycomb-dataset": `front-end-metrics-${isDev ? 'development' : 'production'}`
      }
const prodHeaders = { Authorization: `Bearer ${token}`}

const exporter = new OTLPTraceExporter({
    // optional - default url is http://localhost:4318/v1/traces
    // need to add backboard endpoint
    url: isDev ? "https://api.honeycomb.io:443/v1/traces" : "http://localhost:4318/v1/traces",
    // optional - collection of custom headers to be sent with each request, empty by default
    // need to add authorization header & token for production
    headers: isDev ? devHeaders : prodHeaders,
    compression: "none"
  })
export const processor = new BatchSpanProcessor(exporter);
provider.addSpanProcessor(processor);

interface Telemetry {
    command: string,
    os: string,
    version: string,
    exitCode: number,
    exitState: string,
    cliRunDuration: number,
    commandRunDuration: number,
    lifecycleHookCompletion: {
      init: boolean,
      prerun: boolean,
      postrun: boolean,
      command_not_found: boolean,
    }
}

export interface TelemetryGlobal extends NodeJS.Global {
  cliTelemetry?: Telemetry
}

interface cliError extends Error {
  cli_run_duration?: number
}

export function initializeInstrumentation() {
  provider.register();
}

export function setupTelemetry(config: any, opts: any) {
  const now = new Date()
  const cmdStartTime = now.getTime()
  return {
    command: opts.Command.id,
    os: config.platform,
    version: config.version,
    exitCode: 0,
    exitState: 'successful',
    cliRunDuration: 0,
    commandRunDuration: cmdStartTime,
    lifecycleHookCompletion: {
      init: true,
      prerun: true,
      postrun: false,
      command_not_found: false,
    },
  }
}

export function computeDuration(cmdStartTime: any) {
  // calculate time duration from start time till now
  const now = new Date()
  const cmdFinishTime = now.getTime()

  return cmdFinishTime - cmdStartTime
}

export function reportCmdNotFound(config: any) {
  return {
    command: 'invalid_command',
    os: config.platform,
    version: config.version,
    exitCode: 0,
    exitState: 'command_not_found',
    cliRunDuration: 0,
    commandRunDuration: 0,
    lifecycleHookCompletion: {
      init: true,
      prerun: false,
      postrun: false,
      command_not_found: true,
    },
  }
}

export async function sendTelemetry(currentTelemetry: any) {
  // send telemetry to honeycomb and rollbar
  let telemetry = currentTelemetry

  if (telemetry instanceof Error) {
    let cliError: cliError
    cliError = {name: telemetry.name, message: telemetry.message, stack: telemetry.stack, cli_run_duration: currentTelemetry.cliRunDuration}
    await sendToRollbar(cliError)
    await sendToHoneycomb(cliError)
  }

  await sendToHoneycomb(telemetry)
}

export async function sendToHoneycomb(data: any) {
  try {
    const tracer = opentelemetry.trace.getTracer('heroku-cli');
    const span = tracer.startSpan('heroku-cli-tracer')

    if (data instanceof Error) {
      let cliError: cliError = data
      span.setAttribute('error_name', cliError.name)
      span.setAttribute('error_message', cliError.message)
      span.setAttribute('error_stack', cliError.stack)
      span.setAttribute('cli_run_duration', cliError.cli_run_duration)
    } else {
      span.setAttribute('command', data.command)
      span.setAttribute('os', data.os)
      span.setAttribute('version', data.version)
      span.setAttribute('exit_code', data.exitCode)
      span.setAttribute('exit_state', data.exitState)
      span.setAttribute('cli_run_duration', data.cliRunDuration)
      span.setAttribute('command_run_duration', data.commandRunDuration)
      span.setAttribute('lifecycle_hook.init', data.lifecycleHookCompletion.init)
      span.setAttribute('lifecycle_hook.prerun', data.lifecycleHookCompletion.prerun)
      span.setAttribute('lifecycle_hook.postrun', data.lifecycleHookCompletion.postrun)
      span.setAttribute('lifecycle_hook.command_not_found', data.lifecycleHookCompletion.command_not_found)
    }
    span.end()
    processor.forceFlush()
  } catch {
    debug('could not send telemetry')
  }
}

export async function sendToRollbar(data: any) {
  try {
    // send data to rollbar
    rollbar.error('Failed to complete execution', data, () => {
      process.exit(1)
    })
  } catch {
    debug('Could not send error report')
    process.exit(1)
  }
}