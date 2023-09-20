import fs from 'node:fs';
import { Client } from 'pg';
import { client } from './database';

type MigrationMode = 'up' | 'down';

class MigrationCoordinator {
  public static migrationsDir = './migrations';
  public static defaultMigrationContent = '-- Migration file\n\n';
  private static readonly initSQL = `
      CREATE SCHEMA IF NOT EXISTS public;
      CREATE TABLE IF NOT EXISTS public.db_schema_migrations (
        id              SERIAL PRIMARY KEY,
        name            TEXT NOT NULL,
        migration_time  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        batch           INT NOT NULL,
        up              BOOLEAN NOT NULL,
        
        CONSTRAINT unq_db_schema_migrations_name UNIQUE (name)
    );
  `;

  constructor(private _pgClient: Client) {}

  private generateMigrationFilenamePair(name: string): [string, string] {
    const transformedSnakeCaseName = name.toLowerCase().replace(/ /g, '_');
    const baseFileName = `${new Date().getTime()}_${transformedSnakeCaseName}`;

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

  public async migrate(mode: MigrationMode) {
    await this._pgClient.query(MigrationCoordinator.initSQL);

    const filesRegExp = new RegExp(`^[0-9]+_[a-zA-Z_]+_up.sql$`);
    const migrationFiles = fs.readdirSync(MigrationCoordinator.migrationsDir).filter((file) => filesRegExp.test(file));

    const migrations = await client.query('SELECT * FROM public.db_schema_migrations');

    for (const migrationFile of migrationFiles) {
      const query = await client.query(
        `
        SELECT
            CASE
                WHEN EXISTS (SELECT * FROM public.db_schema_migrations WHERE name = $1) THEN TRUE
                ELSE FALSE
            END AS is_migrated
    `,
        [migrationFile],
      );

      const batchNbr: number = (
        await client.query(`
        SELECT MAX(batch) AS batch_nbr
        FROM public.db_schema_migrations
      `)
      ).rows[0].batch_nbr;

      /*
      await client.query(
        `
        INSERT INTO public.db_schema_migrations (name, batch, up)
            VALUES($1, $2, $3)
      `,
        [migrationFile, 1],
      ); */

      console.log(query.rows);
    }

    return Promise.resolve(mode);
  }
}

class MigrationCLI {
  public static readonly validCommands = ['new', 'up'] as const;

  constructor(private _migration: MigrationCoordinator) {}

  private validateCommand(input: string | undefined): input is (typeof MigrationCLI.validCommands)[number] {
    return input ? MigrationCLI.validCommands.includes(input as (typeof MigrationCLI.validCommands)[number]) : false;
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
      case 'up': {
        await this._migration.migrate('up');
      }
    }

    return Promise.resolve();
  }
}

client
  .connect()
  .then(() => {
    const migrationCli = new MigrationCLI(new MigrationCoordinator(client));

    return migrationCli.execute();
  })
  .catch((err) => {
    console.error(err);
  })
  .finally(() => client.end());
