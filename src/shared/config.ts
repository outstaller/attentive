import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type AppMode = 'LAN' | 'INTERNET';

export interface AppConfig {
    mode: AppMode;
    relayUrl: string;
}

const DEFAULT_CONFIG: AppConfig = {
    mode: 'LAN',
    relayUrl: 'http://algodon.eastus.cloudapp.azure.com'
};

export class ConfigManager {
    private static instance: ConfigManager;
    private config: AppConfig;

    private constructor() {
        this.config = this.loadConfig();
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    private loadConfig(): AppConfig {
        const configName = 'config.json';

        let possiblePaths: string[] = [];

        try {
            if (app) {
                possiblePaths.push(path.join(app.getPath('userData'), configName));
            }
        } catch (e) { }

        if (process.resourcesPath) {
            possiblePaths.push(path.join(process.resourcesPath, configName));
        }

        possiblePaths.push(path.join(process.cwd(), configName));

        console.log('[ConfigManager] Searching for config in paths:', JSON.stringify(possiblePaths));

        try {
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    console.log(`[ConfigManager] FOUND config at: ${p}`);
                    const fileContent = fs.readFileSync(p, 'utf-8');
                    const parsed = JSON.parse(fileContent);
                    const finalConfig = { ...DEFAULT_CONFIG, ...parsed };

                    console.log('[ConfigManager] Active Configuration Dump:', JSON.stringify(finalConfig, null, 2));
                    return finalConfig;
                }
            }
        } catch (error) {
            console.error('[ConfigManager] Error loading config, using defaults:', error);
        }

        console.log('[ConfigManager] No external config found. Using DEFAULTS.');
        console.log('[ConfigManager] Default Configuration Dump:', JSON.stringify(DEFAULT_CONFIG, null, 2));
        return DEFAULT_CONFIG;
    }

    public getConfig(): AppConfig {
        return this.config;
    }
}
