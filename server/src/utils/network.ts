import os from 'os';
import { config } from '../config.js';

export interface NetworkSummary {
  localUrl: string;
  lanIp: string;
  port: number;
  allLanIps: string[];
  hostname: string;
}

export function detectNetworkInterfaces(): NetworkSummary {
  const interfaces = os.networkInterfaces();
  const lanIps: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;

    for (const net of netList) {
      // IPv4 and not loopback
      if (net.family === 'IPv4' && !net.internal) {
        // Exclude virtual/docker/WSL/bridge interfaces if obvious
        const lowerName = name.toLowerCase();
        if (
          !lowerName.includes('virtual') &&
          !lowerName.includes('vmware') &&
          !lowerName.includes('docker') &&
          !lowerName.includes('veth')
        ) {
          lanIps.push(net.address);
        }
      }
    }
  }

  // Fallback to first non-internal if filter was too aggressive
  if (lanIps.length === 0) {
    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name];
      if (!netList) continue;
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal) {
          lanIps.push(net.address);
        }
      }
    }
  }

  const primaryIp = lanIps[0] || '127.0.0.1';
  const protocol = config.ALLOW_HTTP_INSECURE_LAN ? 'http' : 'https';
  const localUrl = `${protocol}://${primaryIp}:${config.PORT}`;

  return {
    localUrl,
    lanIp: primaryIp,
    port: config.PORT,
    allLanIps: lanIps.length > 0 ? lanIps : ['127.0.0.1'],
    hostname: os.hostname(),
  };
}
