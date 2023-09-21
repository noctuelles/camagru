import fs from 'node:fs';
import { Client } from 'pg';
import { DownMigrationStrategy, MigrationStrategy, UpMigrationStrategy } from './strategy';
import { client } from '../index';
import { snakeCase } from 'change-case';

export class MigrationCoordinator {
    public static migrationsDir = './migrations';
    public static defaultMigrationContent = '-- Migration file\n\n';
    private static readonly initSQL = `
      CREATE TABLE IF NOT EXISTS db_schema_migrations (
        id              serial PRIMARY KEY,
        name_up         text NOT NULL,
        name_down       text NOT NULL GENERATED ALWAYS AS ( REPLACE(name_up, '_up.sql', '_down.sql') ) STORED ,
        migration_time  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        batch           int NOT NULL,
        
        CONSTRAINT unq_db_schema_migrations_name_up UNIQUE (name_up),
        CONSTRAINT unq_db_schema_migrations_name_down UNIQUE (name_down)
    );
  `;

    constructor(private _pgClient: Client) {}

    private generateMigrationFilenamePair(name: string): [string, string] {
        const baseFileName = `${new Date().getTime()}_${snakeCase(name)}`;

        return [`${baseFileName}_up.sql`, `${baseFileName}_down.sql`];
    }

    public new(name: string) {
        if (!fs.existsSync(MigrationCoordinator.migrationsDir)) {
            fs.mkdirSync(MigrationCoordinator.migrationsDir);
        }

        const generatedMigrationFilenames = this.generateMigrationFilenamePair(name);

        generatedMigrationFilenames.forEach((fileName) => {
            const relativeFilePath = `${MigrationCoordinator.migrationsDir}/${fileName}`;

            fs.writeFileSync(relativeFilePath, MigrationCoordinator.defaultMigrationContent, { encoding: 'utf-8' });
        });

        return generatedMigrationFilenames;
    }

    public async migrateWith<T>(migrationStrategy: MigrationStrategy<T>) {
        let result: T;

        try {
            await this._pgClient.query('BEGIN');

            await this._pgClient.query(MigrationCoordinator.initSQL);

            result = await migrationStrategy.exec(this._pgClient);

            await this._pgClient.query('COMMIT');
        } catch (e) {
            await this._pgClient.query('ROLLBACK');
            throw e;
        }

        return result;
    }
}

class MigrationCLI {
    public static readonly validCommands = ['new', 'up', 'down'] as const;

    constructor(private _migration: MigrationCoordinator) {}

    private validateCommand(input: string | undefined): input is (typeof MigrationCLI.validCommands)[number] {
        return input
            ? MigrationCLI.validCommands.includes(input as (typeof MigrationCLI.validCommands)[number])
            : false;
    }

    public async execute() {
        const command: string | undefined = process.argv[2];

        if (!this.validateCommand(command)) {
            throw new Error(`Invalid command ${command}`);
        }

        switch (command) {
            case 'new': {
                const name: string | undefined = process.argv[3];

                if (!name) {
                    throw new Error('No migration name.');
                }

                this._migration.new(name).forEach((fileName) => console.info('Created', fileName));

                break;
            }
            case 'up':
                await this._migration.migrateWith(
                    new UpMigrationStrategy().on('migration', (migratedFile) => {
                        console.info('Successfully migrated', migratedFile, '!');
                    }),
                );
                break;
            case 'down':
                await this._migration.migrateWith(
                    new DownMigrationStrategy().on('undidMigration', (undidMigrationName) => {
                        console.info('Successfully undid migration with', undidMigrationName, '!');
                    }),
                );
                break;
        }

        return Promise.resolve();
    }
}

client
    .connect()
    .then(() => new MigrationCLI(new MigrationCoordinator(client)).execute())
    .catch((err) => {
        console.error(err);
    })
    .finally(() => client.end());
