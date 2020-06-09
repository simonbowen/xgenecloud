const path = require('path');
const inquirer = require('inquirer')
const chalkPipe = require('chalk-pipe');
const {promisify} = require("util");
const Util = require('../util/Util');
const mkdirp = require('mkdirp');
const URL = require('url');

var tcpPortUsed = require('tcp-port-used');

const dbDefaults = {
  mysql: {
    host: 'localhost',
    port: '3306',
    username: 'root',
    password: '',
    database: ''
  },
  pg: {
    host: 'localhost',
    port: '5432',
    username: 'postgres',
    password: '',
    database: ''
  },
  mssql: {
    host: 'localhost',
    port: '1433',
    username: 'sa',
    password: '',
    database: ''
  },
  sqlite3: {
    host: 'localhost',
    port: '1433',
    username: 'sa',
    password: '',
    database: ''
  },
};

class NewMgr {

  /**
   *
   * Does the below :
   * - Get database input and make a DB URL from it.
   * - Create new folder and 'cd' to that folder.
   * - Return true/success
   * - Else failure
   *
   * @param args
   * @returns {Promise<string|string|boolean|*>}
   */
  static async getNewProjectInput(args) {

    if (args._.length < 2) {
      const usage = '\n$ xc new project_name'.green.bold
      console.log(`\n\nWarning! missing project name\n\nExample Usage:\n${usage}\n`.bold.red);
      return false;
    }

    /* Construct database URL from prompt */
    const dbTypes = Object.keys(dbDefaults);
    args.url = []

    const answers = await inquirer
      .prompt([
        {
          name: 'type',
          type: 'list',
          message: '🔥 Choose SQL Database type\t:',
          choices: dbTypes.map(t => ({
            name: t,
            value: t,
            short: t.green.bold
          })),
          default: 'mysql',
          transformer: function (color) {
            return chalkPipe(color)(color.green.bold);
          }
        },
        {
          name: 'host',
          type: 'input',
          message: '👉 Enter database host name\t:',
          default(ans) {
            return dbDefaults[ans.type].host
          },
          transformer: function (color) {
            return chalkPipe(color)(color.green.bold);
          },
          when({type}) {
            return type !== 'sqlite3'
          }
        },
        {
          name: 'port',
          type: 'number',
          message: '👉 Enter database port number\t:',
          default(ans) {
            return dbDefaults[ans.type].port
          },
          transformer: function (color) {
            try {
              return color.green.bold;
            } catch (e) {
              return color
            }
          },
          validate: function (port, answers) {
            var done = this.async();
            NewMgr.isPortOpen(answers.host, port).then(isOpen => {
              if (isOpen) {
                done(null, true)
              } else {
                // done('Port is not open')
                console.log(`\n\n😩 ${answers.host}:${port} is not open please start the database if you haven't\n`.red.bold)
                process.exit(0);
              }
            }).catch(done)
          },
          when({type}) {
            return type !== 'sqlite3'
          }
        },
        {
          name: 'username',
          type: 'input',
          message: '👉 Enter database username\t:',
          default(ans) {
            return dbDefaults[ans.type].username
          },
          transformer: function (color) {
            return chalkPipe(color)(color.green.bold);
          },
          when({type}) {
            return type !== 'sqlite3'
          }
        },
        {
          name: 'password',
          type: 'input',
          mask: true,
          message: '🙈 Enter database password\t:',
          transformer: function (color) {
            return new Array(color.length).fill('*'.green.bold).join('')
          },
          when({type}) {
            return type !== 'sqlite3'
          }
        },
        {
          name: 'database',
          type: 'input',
          default(ans) {
            return args._[1] + '_dev';
          },
          message: '👉 Enter database/schema name\t:',
          transformer: function (color) {
            return chalkPipe(color)(color.green.bold);
          },
          when({type}) {
            return type !== 'sqlite3'
          }
        },
        {
          name: 'projectType',
          type: 'list',
          message: '🚀 Enter API type to generate\t:',
          choices: ['REST APIs', 'GRAPHQL APIs'].map(t => ({
            name: t,
            value: t,
            short: t.green.bold
          })),
          transformer: function (color) {
            return chalkPipe(color)(color.green.bold);
          },
          when({type}) {
            return type !== 'sqlite3'
          }
        }
      ])

    // console.log(answers);

    if (answers.type === 'sqlite3') {
      console.log('Please use desktop app to create Sqlite project'.green.bold)
      process.exit(0);
    }

    /* if not valid retry getting right input */
    if (!answers.database) {
      console.log('\n\tWarning! Database name can NOT be empty. Retry.\n '.red.bold);
      this.getNewProjectInput(args);
    }

    /* attach new project name to path and 'cd' to that folder */
    args.folder = path.join(args.folder, args._[1]);
    mkdirp.sync(args.folder);
    process.chdir(args.folder);
    // await Util.runCmd(`cd ${args.folder}`);

    /* prepare the args */
    const url = `${answers.type}://${answers.host}:${answers.port}?u=${answers.username}&p=${answers.password}&d=${answers.database}`;
    args._[0] = answers.projectType === 'REST APIs' ? 'gar' : 'gag';
    args.url.push(url);
    return await NewMgr.testConnection(args)

  }


  static async testConnection({url}) {

    for (const u of url) {
      const parsedUrlData = URL.parse(u, true);
      const queryParams = parsedUrlData.query;
      const client = parsedUrlData.protocol.slice(0, -1);
      const config = {
        client,
        connection: {
          host: parsedUrlData.hostname,
          port: +parsedUrlData.port,
          user: queryParams.u,
          password: queryParams.p,
          database: client === 'pg' ? 'postgres' : (client === 'mssql' ? undefined : null)
        }
      };


      try {
        const knex = require('knex')(config)
        await knex.raw("SELECT 1+1 as data");
      } catch (e) {
        console.log(`\n😩 Test connection failed for : ${url}\n`.red.bold)
        return false;
      }
    }
    return true;
  }


  static async isPortOpen(host, port) {
    try {
      return await tcpPortUsed.check(+port, host)
    } catch (e) {
      console.log(e)
      console.log(`\n😩 ${host}:${port} is not reachable please check\n`.red.bold)
      return true;
    }
  }

}


module.exports = NewMgr;