import { Client } from 'pg';
import fs from 'node:fs';
import { MigrationCoordinator } from './index';
import { TypedEmitter } from 'tiny-typed-emitter';

export interface MigrationStrategy<T> extends TypedEmitter {
    exec(client: Client): Promise<T>;
}

interface UpMigrationEvents {
    migration: (migrationName: string) => void;
}

export class UpMigrationStrategy extends TypedEmitter<UpMigrationEvents> implements MigrationStrategy<string[]> {
    constructor() {
        super();
    }
    public async exec(client: Client) {
        const filesRegExp = new RegExp(`^[0-9]+_[a-zA-Z0-9_]+_up.sql$`);
        const migrationFiles = fs
            .readdirSync(MigrationCoordinator.migrationsDir)
            .filter((file) => filesRegExp.test(file));
        const queryResult = (
            await client.query(`
        SELECT
            ARRAY_AGG(name_up) AS migrations,
            MAX(batch) AS batch_nbr
        FROM db_schema_migrations
      `)
        ).rows[0];
        const filesToMigrate = migrationFiles.filter((migrationFile) => {
            return queryResult.migrations ? !queryResult.migrations.includes(migrationFile) : true;
        });
        const currentBatchNbr = queryResult.batch_nbr ? queryResult.batch_nbr + 1 : 1;

        for (const fileToMigrate of filesToMigrate) {
            const fileContent = fs.readFileSync(`${MigrationCoordinator.migrationsDir}/${fileToMigrate}`, {
                encoding: 'utf-8',
            });

            await client.query(fileContent);
            await client.query(
                `
        INSERT INTO db_schema_migrations (name_up, batch, migration_time) VALUES ($1, $2, $3)
      `,
                [fileToMigrate, currentBatchNbr, new Date()],
            );

            this.emit('migration', fileToMigrate);
        }

        return filesToMigrate;
    }
}

interface DownMigrationEvents {
    undidMigration: (undidMigrationName: string) => void;
}

export class DownMigrationStrategy extends TypedEmitter<DownMigrationEvents> implements MigrationStrategy<string[]> {
    constructor() {
        super();
    }
    public async exec(client: Client) {
        const queryResult = (
            await client.query(`
            SELECT
                ARRAY_AGG(name_down ORDER BY migration_time DESC) AS latest_migration_batch
            FROM
                db_schema_migrations
            WHERE
                batch = (SELECT MAX(batch) FROM db_schema_migrations)
        `)
        ).rows[0];

        if (!queryResult.latest_migration_batch) {
            return [];
        }

        const migrationsToUndo = queryResult.latest_migration_batch as string[];

        for (const migrationToUndo of migrationsToUndo) {
            const fileContent = fs.readFileSync(`${MigrationCoordinator.migrationsDir}/${migrationToUndo}`, {
                encoding: 'utf-8',
            });

            await client.query(fileContent);
            await client.query(
                `
                DELETE FROM db_schema_migrations
                WHERE name_down = $1
            `,
                [migrationToUndo],
            );

            this.emit('undidMigration', migrationToUndo);
        }

        return migrationsToUndo;
    }
}
