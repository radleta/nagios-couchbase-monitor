#!/usr/bin/env node

'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment');
var numeral = require('numeral');
var Plugin = require('nagios-plugin');
var program = require('commander');

// create a new plugin object with optional initialization parameters
var appName = 'nagios-couchbase-monitor';

// set up the program
program
  .version('1.0.0')
  .option('-v, --verbose', 'Outputs the verbose output for the program.')
  //.usage('[options]')
  .parse(process.argv);

// define the node command
program
  .command('node <host>')
  .description('checks the status of a Couchbase node to ensure its working properly')
  .option('--port [n]', 'The port of the Couchbase HTTP REST API. Defaults to 8091.', Number)
  .option('--url [url]', 'The path of the HTTP REST API to access the Couchbase stats. Defaults to /pools/nodes.')
  .option('-u, --username [username]', 'The username to use to fetch the stats from the HTTP REST interface.')
  .option('-p, --password [password]', 'The password to use to fetch the stats from the HTTP REST interface.')
  .action(function(host, options) {
    
    var o = new Plugin({
      // shortName is used in output
      shortName : 'node'
    });

    // normalize inputs
    var port = options.port || 8091;
    
    // build the url
    var statsUrl = 'http://';
    if (options.username || options.password) {
      statsUrl += options.username + ':' + options.password + '@';
    }
    statsUrl += host;
    statsUrl += (port ? ':' + port : '');
    statsUrl += (options.url || '/pools/nodes');

    // send the request
    var requestBefore = new Date().getTime();
    request(statsUrl, function (err, response, body) {
      var requestAfter = new Date().getTime();
      var requestTime = (requestAfter - requestBefore) / 1000;
      
      if (err) {
        o.nagiosExit(o.states.CRITICAL, err);
        return;
      } else if (response.statusCode !== 200) {
        o.nagiosExit(o.states.CRITICAL, 'Unexpected status code. HTTP ' + response.statusCode + ' returned.');
        return;
      } else if (!body 
        || body.length === 0) {
        o.nagiosExit(o.states.CRITICAL, 'Empty response body.');
        return;
      }
      
      // fetch node stats data
      var stats = JSON.parse(body);

      // // ensure we have a green status
      // var balanced = _.get(stats, 'balanced');
      // if (!balanced) {
      //   o.addMessage(o.states.WARNING, 'Couchbase is unbalanced.');
      // }

      // var ramTotal = _.get(stats, 'storageTotals.ram.total');
      // var ramUsed = _.get(stats, 'storageTotals.ram.used');
      // if (ramTotal > 0 
      //   && ramUsed > 0) {
        
      // } else {
      //   o.addMessage(o.states.CRITICAL, 'RAM stats invalid. Used ' + numeral(ramUsed).format('0,0') + '. Total ' + numeral(ramTotal).format('0,0') + '.');
      // }

      // find the node
      var node = _(stats)
        .get('nodes')
        .find(function (n) { return n.hostname === host + ':' + port; });
      if (node) {
        
        if (node.status !== 'healthy') {
          o.addMessage(o.states.CRITICAL, 'Node unhealthy. status = ' + node.status);
        }
        
        if (node.clusterMembership !== 'active') {
          o.addMessage(o.states.CRITICAL, 'Node membership invalid. clusterMembership = ' + node.clusterMembership);
        }

        var nodeStats = node.interestingStats;
        if (nodeStats) {

          for (var nodeStatName in nodeStats) {

            o.addPerfData({
              label: nodeStatName,
              value: nodeStats[nodeStatName],
              uom: '',
              min: 0,
            });

          }
            
        } else {
          o.addMessage(o.states.WARNING, 'Node interestingStats not found.');
        }

      } else {
        o.addMessage(o.states.CRITICAL, 'Node not found.');
      }
      
      var messageObj = o.checkMessages();
      if (!messageObj) {
        o.addMessage(o.states.OK, 'Everything okay.');
        messageObj = o.checkMessages();
      }
      o.nagiosExit(messageObj.state, messageObj.message);
      
    });
    
  });
  
program.parse(process.argv);

if (!process.argv || (process.argv[0] === 'node' && process.argv.length <= 2)) {
  program.outputHelp();
}