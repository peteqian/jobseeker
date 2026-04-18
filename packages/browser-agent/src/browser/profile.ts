import type { BrowserChannel } from "../cdp/discovery";

export interface BrowserProfileInit {
  cdpUrl?: string;
  executablePath?: string;
  channel?: BrowserChannel;
  headless?: boolean;
  userDataDir?: string;
  proxyServer?: string;
  proxyBypass?: string;
  userAgent?: string;
  acceptLanguage?: string;
  locale?: string;
  timezoneId?: string;
  extensionPaths?: string[];
  remoteDebuggingPort?: number;
  docker?: boolean;
  disableSecurity?: boolean;
  extraArgs?: string[];
  maxLaunchRetries?: number;
  autoInstallBrowser?: boolean;
  reconnectOnDisconnect?: boolean;
  reconnectMaxAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  captchaSolver?: boolean;
}

export class BrowserProfile {
  cdpUrl: string | undefined;
  executablePath: string | undefined;
  channel: BrowserChannel;
  headless: boolean;
  userDataDir: string | undefined;
  proxyServer: string | undefined;
  proxyBypass: string | undefined;
  userAgent: string | undefined;
  acceptLanguage: string | undefined;
  locale: string | undefined;
  timezoneId: string | undefined;
  extensionPaths: string[];
  remoteDebuggingPort: number | undefined;
  docker: boolean;
  disableSecurity: boolean;
  extraArgs: string[];
  maxLaunchRetries: number;
  autoInstallBrowser: boolean;
  reconnectOnDisconnect: boolean;
  reconnectMaxAttempts: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  captchaSolver: boolean;

  constructor(init: BrowserProfileInit = {}) {
    this.cdpUrl = init.cdpUrl;
    this.executablePath = init.executablePath;
    this.channel = init.channel ?? "chromium";
    this.headless = init.headless ?? true;
    this.userDataDir = init.userDataDir;
    this.proxyServer = init.proxyServer;
    this.proxyBypass = init.proxyBypass;
    this.userAgent = init.userAgent;
    this.acceptLanguage = init.acceptLanguage;
    this.locale = init.locale;
    this.timezoneId = init.timezoneId;
    this.extensionPaths = init.extensionPaths ?? [];
    this.remoteDebuggingPort = init.remoteDebuggingPort;
    this.docker = init.docker ?? false;
    this.disableSecurity = init.disableSecurity ?? false;
    this.extraArgs = init.extraArgs ?? [];
    this.maxLaunchRetries = init.maxLaunchRetries ?? 3;
    this.autoInstallBrowser = init.autoInstallBrowser ?? true;
    this.reconnectOnDisconnect = init.reconnectOnDisconnect ?? true;
    this.reconnectMaxAttempts = init.reconnectMaxAttempts ?? 6;
    this.reconnectBaseDelayMs = init.reconnectBaseDelayMs ?? 500;
    this.reconnectMaxDelayMs = init.reconnectMaxDelayMs ?? 8_000;
    this.captchaSolver = init.captchaSolver ?? true;
  }

  isRemoteConnection(): boolean {
    return typeof this.cdpUrl === "string" && this.cdpUrl.length > 0;
  }

  isManagedLocal(): boolean {
    return !this.isRemoteConnection();
  }
}
