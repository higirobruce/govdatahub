const { AppDataSource } = require('./dist/database/data-source.js');

AppDataSource.initialize()
  .then(async () => {
    console.log('Data Source initialized');
    await AppDataSource.runMigrations();
    console.log('Migrations executed successfully');
    await AppDataSource.destroy();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during migration:', error);
    process.exit(1);
  });
