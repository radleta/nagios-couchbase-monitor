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

function isAtThreshold(pluginObj, messageState, perfData, threshold) {

  var thresholdComparerLength;
  var thresholdComparer;
  var thresholdText;
  if (threshold.indexOf('>=') === 0) {
    thresholdComparerLength = 2;
    thresholdText = 'greater than or equal to';
    thresholdComparer = function (tv) { return perfData.value >= tv; };
  } else if (threshold.indexOf('<=') === 0) {
    thresholdComparerLength = 2;
    thresholdText = 'less than or equal to';
    thresholdComparer = function (tv) { return perfData.value <= tv; };
  } else if (threshold.indexOf('>') === 0) {
    thresholdComparerLength = 1;
    thresholdText = 'greater than';
    thresholdComparer = function (tv) { return perfData.value > tv; };
  } else if (threshold.indexOf('<') === 0) {
    thresholdComparerLength = 1;
    thresholdText = 'less than';
    thresholdComparer = function (tv) { return perfData.value < tv; };
  } else if (threshold.indexOf('=') === 0) {
    thresholdComparerLength = 1;
    thresholdText = 'equal to';
    thresholdComparer = function (tv) { return perfData.value === tv; };
  } else {
    pluginObj.addMessage(pluginObj.stats.CRITICAL, 'Threshold invalid.');
    return true;
  }
  
  var thresholdValue = Number(threshold.substring(thresholdComparerLength));
  if (thresholdComparer(thresholdValue)) {
    pluginObj.addMessage(messageState, 'The ' + perfData.label + ' is ' + thresholdText + ' expected. Value = ' + perfData.value + ', Threshold = ' + thresholdValue);    
    return true;
  }

  return false;
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
      shortName : 'node ' + host
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
      shortName : 'cluster ' + host
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
  

// define the bucket command
program
  .command('bucket <host> <bucket>')
  .description('checks the status of a Couchbase bucket to ensure its working properly')
  .option('--port [n]', 'The port of the HTTP REST API. Defaults to 8091.', Number)
  .option('--url [url]', 'The path of the HTTP REST API. Defaults to /pools/default/buckets/<bucket>.')
  .option('-u, --username [username]', 'The username to use to fetch the stats from the HTTP REST interface.')
  .option('-p, --password [password]', 'The password to use to fetch the stats from the HTTP REST interface.')
  .option('-w, --warning-quota [warningQuota]', 'The threshold where the quota is in warning. Value is 0-100. Defaults to 85. Example syntax: <85, <=95, >65, >=50')
  .option('-c, --critical-quota [criticalQuota]', 'The threshold where the quota is in critical. Value is 0-100. Defaults to 95. Example syntax: <85, <=95, >65, >=50')
  .action(function(host, bucket, options) {
    
    var o = new Plugin({
      // shortName is used in output
      shortName : 'cluster ' + host + ' bucket ' + bucket
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
    statsUrl += (options.url || '/pools/default/buckets/<bucket>')
      .replace('<bucket>', bucket);

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

      // output basicStats as perf data
      var basicPerfDataByLabel = getPerfDataByLabelFromObj(o, stats, 'basicStats');      
      _.set(basicPerfDataByLabel, 'quotaPercentUsed.max', 100);
      addPerfDataByLabelToPlugin(o, basicPerfDataByLabel);

      // do health checks
      isAtThreshold(o, o.states.WARNING, basicPerfDataByLabel['quotaPercentUsed'], options.warningQuota || '>=85');
      isAtThreshold(o, o.states.CRITICAL, basicPerfDataByLabel['quotaPercentUsed'], options.criticalQuota || '>=95');

      var messageObj = o.checkMessages();
      if (!messageObj) {
        var quotaPercentUsed = _.get(basicPerfDataByLabel, 'quotaPercentUsed.value');
        var opsPerSec = _.get(basicPerfDataByLabel, 'opsPerSec.value');
        var itemCount = _.get(basicPerfDataByLabel, 'itemCount.value');
        o.addMessage(o.states.OK, numeral(itemCount).format('0,0a') + ' items, ' 
          + numeral(quotaPercentUsed/100).format('0.0%') + ' quota, ' 
          + numeral(opsPerSec).format('0,0a') + ' ops/s');
        messageObj = o.checkMessages();
      }
      o.nagiosExit(messageObj.state, messageObj.message);
      
    });
    
  });

// define the bucket-stat command
program
  .command('bucket-stat <host> <bucket> <stat>')
  .description('checks the status of a Couchbase bucket to ensure its working properly')
  .option('--port <n>', 'The port of the HTTP REST API. Defaults to 8091.', Number)
  .option('--url <url>', 'The path of the HTTP REST API. Defaults to /pools/default/buckets/<bucket>/stats?zoom=<zoom>.')
  .option('-u, --username <username>', 'The username to use to fetch the stats from the HTTP REST interface.')
  .option('-p, --password <password>', 'The password to use to fetch the stats from the HTTP REST interface.')
  .option('-w, --warning <warning>', 'Expression to determine whether the stat is in warning state. Example: <0, <=1, >100, >=100')
  .option('-c, --critical <critical>', 'Expression to determine whether the stat is in critical state. Example: <0, <=1, >100, >=100')
  .option('-z, --zoom <zoom>', 'Provides a statistical sampling for that bucket stats at a particular interval (minute | hour | day | week | month | year). Defaults to hour.')
  .action(function(host, bucket, stat, options) {
    
    var o = new Plugin({
      // shortName is used in output
      shortName : 'bucket ' + bucket + ' stat ' + stat
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
    statsUrl += (options.url || '/pools/default/buckets/<bucket>/stats?zoom=<zoom>')
      .replace('<bucket>', bucket)
      .replace('<zoom>', options.zoom || 'hour');

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

      // analyze stats
      var statPath = 'op.samples.' + stat;
      var sample = _.get(stats, statPath);
      if (!_.isEmpty(sample)) {

        var mean = _.mean(sample);
        var min = _.min(sample);
        var max = _.max(sample);
        var perfData = {
          label: stat,
          min: min,
          max: max,
          value: mean,
          uom: '',
        };
        o.addPerfData(perfData);

        if (options.critical
          && isAtThreshold(o, o.states.CRITICAL, perfData, options.critical)) {
        } else if (options.warning
          && isAtThreshold(o, o.states.WARNING, perfData, options.warning)) {          
        }
        
      } else {
        o.addMessage(o.states.CRITICAL, statPath + ' not found.');        
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