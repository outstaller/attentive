import * as fs from 'fs';
import * as path from 'path';

export type AppMode = 'LAN' | 'INTERNET';

export interface AppConfig {
    mode: AppMode;
    relayUrl: string;
}

const DEFAULT_CONFIG: AppConfig = {
    mode: 'INTERNET',
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
        try {
            // Check for config.json in the same directory as the executable or root
            const configName = 'config.json';

            // Paths to check:
            // 1. process.cwd() (Good for dev: root)
            // 2. process.resourcesPath (Good for prod: adjacent to app.asar)
            // 3. execution directory

            let possiblePaths: string[] = [
                path.join(process.cwd(), configName),
            ];

            if (process.resourcesPath) {
                possiblePaths.push(path.join(process.resourcesPath, configName));
            }

            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    console.log(`Loading config from ${p}`);
                    const fileContent = fs.readFileSync(p, 'utf-8');
                    const parsed = JSON.parse(fileContent);
                    return { ...DEFAULT_CONFIG, ...parsed };
                }
            }
        } catch (error) {
            console.error('Error loading config, using defaults:', error);
        }

        return DEFAULT_CONFIG;
    }

    public getConfig(): AppConfig {
        return this.config;
    }
}
