#!/usr/bin/env node

'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment');
var numeral = require('numeral');
var Plugin = require('nagios-plugin');
var program = require('commander');

function getPerfDataByLabelFromObj(pluginObj, obj, path, prefix) {

  var result = {};

  var stats = _.get(obj, path);
  if (stats) {

    for (var statName in stats) {

      var label;
      if (prefix && prefix.length) {
        label = prefix + _.upperFirst(statName);
      } else {
        label = statName;
      }
      result[label] = {
        label: label,
        value: stats[statName],
        uom: '',
        min: 0,
      };

    }
      
  } else {
    pluginObj.addMessage(o.states.WARNING, path + ' not found.');
  }

  return result;

}

function addPerfDataByLabelToPlugin(pluginObj, perfDataByLabel) {
  
  for (var label in perfDataByLabel) {
    var perfData = perfDataByLabel[label];
    pluginObj.addPerfData(perfData);
  }
  
}

// create a new plugin object with optional initialization parameters
var appName = 'nagios-couchbase-monitor';

// set up the program
program
  .version('1.0.0')
  .option('-v, --verbose', 'Outputs the verbose output for the program.');

// define the node command
program
  .command('node <host>')
  .description('checks the status of a Couchbase node to ensure its working properly')
  .option('--port [n]', 'The port of the HTTP REST API. Defaults to 8091.', Number)
  .option('--url [url]', 'The path of the HTTP REST API for node stats. Defaults to /pools/nodes.')
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

        // output all interestingStats as perf data
        var interestingStatsPerfData = getPerfDataByLabelFromObj(o, node, 'interestingStats');
        _.set(interestingStatsPerfData, 'mem_used.max', _.get(node, 'systemStats.mem_total'));
        addPerfDataByLabelToPlugin(o, interestingStatsPerfData);

        // output all systemStats
        var systemStatsPerfData = getPerfDataByLabelFromObj(o, node, 'systemStats');
        _.set(systemStatsPerfData, 'mem_free.max', _.get(node, 'systemStats.mem_total'));
        _.set(systemStatsPerfData, 'swap_used.max', _.get(node, 'systemStats.swap_total'));
        _.set(systemStatsPerfData, 'cpu_utilization_rate.max', 100);
        addPerfDataByLabelToPlugin(o, systemStatsPerfData);

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


// define the cluster command
program
  .command('cluster <host>')
  .description('checks the status of a Couchbase cluster to ensure its working properly')
  .option('--port [n]', 'The port of the HTTP REST API. Defaults to 8091.', Number)
  .option('--url [url]', 'The path of the HTTP REST API. Defaults to /pools/nodes.')
  .option('-u, --username [username]', 'The username to use to fetch the stats from the HTTP REST interface.')
  .option('-p, --password [password]', 'The password to use to fetch the stats from the HTTP REST interface.')
  .action(function(host, options) {
    
    var o = new Plugin({
      // shortName is used in output
      shortName : 'cluster'
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

      // ensure we have a green status
      var balanced = _.get(stats, 'balanced');
      if (!balanced) {
        o.addMessage(o.states.CRITICAL, 'Couchbase is unbalanced.');
      }

      // output ram as perf data
      var ramPerfDataByLabel = getPerfDataByLabelFromObj(o, stats, 'storageTotals.ram', 'ram');
      var ramTotal = _.get(stats, 'storageTotals.ram.total');
      _.set(ramPerfDataByLabel, 'ramQuotaTotal.max', ramTotal);
      _.set(ramPerfDataByLabel, 'ramUsed.max', ramTotal);
      _.set(ramPerfDataByLabel, 'ramUsedByData.max', ramTotal);
      _.set(ramPerfDataByLabel, 'ramQuotaUsed.max', _.get(stats, 'storageTotals.ram.quotaTotal'));
      _.set(ramPerfDataByLabel, 'ramQuotaUsedPerNode.max', _.get(stats, 'storageTotals.ram.quotaTotalPerNode'));
      addPerfDataByLabelToPlugin(o, ramPerfDataByLabel);
      
      // output hdd as perf data
      var hddPerfDataByLabel = getPerfDataByLabelFromObj(o, stats, 'storageTotals.hdd', 'hdd');
      var hddTotal = _.get(stats, 'storageTotals.hdd.total');
      _.set(hddPerfDataByLabel, 'hddQuotaTotal.max', hddTotal);
      _.set(hddPerfDataByLabel, 'hddUsed.max', hddTotal);
      _.set(hddPerfDataByLabel, 'hddUsedByData.max', hddTotal);
      _.set(hddPerfDataByLabel, 'hddFree.max', hddTotal);
      addPerfDataByLabelToPlugin(o, hddPerfDataByLabel);

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