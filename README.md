# nagios-couchbase-monitor

This is a plugin for Nagios to monitor Couchbase using the standard Nagios output format. It is written in Node.js.

## Features

* Ability to monitor Couchbase at the cluster, node or bucket level

## Usage

```
  Usage: index [options] [command]


  Commands:

    node [options] <host>                         checks the status of a Couchbase node to ensure its working properly
    cluster [options] <host>                      checks the status of a Couchbase cluster to ensure its working properly
    bucket [options] <host> <bucket>              checks a Couchbase bucket to ensure its working properly
    bucket-stat [options] <host> <bucket> <stat>  checks a specific stat of a Couchbase bucket to ensure its working properly

  Options:

    -h, --help     output usage information
    -V, --version  output the version number
    -v, --verbose  Outputs the verbose output for the program.
```

### node Command

```
Usage: node [options] <host>

  checks the status of a Couchbase node to ensure its working properly

  Options:

    -h, --help                 output usage information
    --port [n]                 The port of the HTTP REST API. Defaults to 8091.
    --url [url]                The path of the HTTP REST API for node stats. Defaults to /pools/nodes.
    -u, --username [username]  The username to use to fetch the stats from the HTTP REST interface.
    -p, --password [password]  The password to use to fetch the stats from the HTTP REST interface.
```

### cluster Command

```
  Usage: cluster [options] <host>

  checks the status of a Couchbase cluster to ensure its working properly

  Options:

    -h, --help                 output usage information
    --port [n]                 The port of the HTTP REST API. Defaults to 8091.
    --url [url]                The path of the HTTP REST API. Defaults to /pools/nodes.
    -u, --username [username]  The username to use to fetch the stats from the HTTP REST interface.
    -p, --password [password]  The password to use to fetch the stats from the HTTP REST interface.
```

### bucket Command

```
  Usage: bucket [options] <host> <bucket>

  checks a Couchbase bucket to ensure its working properly

  Options:

    -h, --help                        output usage information
    --port [n]                        The port of the HTTP REST API. Defaults to 8091.
    -u, --username [username]         The username to use to fetch the stats from the HTTP REST interface.
    -p, --password [password]         The password to use to fetch the stats from the HTTP REST interface.
    --warning-quota [warningQuota]    The threshold where the quota is in warning. Value is 0-100. Defaults to 85. Example syntax: <85, <=95, >65, >=50
    --critical-quota [criticalQuota]  The threshold where the quota is in critical. Value is 0-100. Defaults to 95. Example syntax: <85, <=95, >65, >=50
    -z, --zoom <zoom>                 Provides a statistical sampling for that bucket stats at a particular interval (minute | hour | day | week | month | year). Defaults to hour.
```

### bucket-stat Command

```
  Usage: bucket-stat [options] <host> <bucket> <stat>

  checks a specific stat of a Couchbase bucket to ensure its working properly

  Options:

    -h, --help                 output usage information
    --port <n>                 The port of the HTTP REST API. Defaults to 8091.
    --url <url>                The path of the HTTP REST API. Defaults to /pools/default/buckets/<bucket>/stats?zoom=<zoom>.
    -u, --username <username>  The username to use to fetch the stats from the HTTP REST interface.
    -p, --password <password>  The password to use to fetch the stats from the HTTP REST interface.
    -w, --warning <warning>    Expression to determine whether the stat is in warning state. Example: <0, <=1, >100, >=100
    -c, --critical <critical>  Expression to determine whether the stat is in critical state. Example: <0, <=1, >100, >=100
    -z, --zoom <zoom>          Provides a statistical sampling for that bucket stats at a particular interval (minute | hour | day | week | month | year). Defaults to hour.
```

## Getting Started

### Install

* Pull from git
* Run npm install to get all npm packages

#### Example

```
git clone https://github.com/radleta/nagios-couchbase-monitor.git /opt/nagios-couchbase-monitor
cd /opt/nagios-couchbase-monitor
npm install
```

## Implementation

### Simple example of the commands and service definitions for Nagios
```
define command {
  command_name  check_couchbase_cluster
  command_line  node /opt/nagios-couchbase-monitor/lib/index.js cluster $HOSTADDRESS$ $ARG1$
}
define command {
  command_name  check_couchbase_node
  command_line  node /opt/nagios-couchbase-monitor/lib/index.js node $HOSTADDRESS$ $ARG1$
}
define command {
  command_name  check_couchbase_bucket
  command_line  node /opt/nagios-couchbase-monitor/lib/index.js bucket $HOSTADDRESS$ $ARG1$
}
define command {
  command_name  check_couchbase_bucket_stat
  command_line  node /opt/nagios-couchbase-monitor/lib/index.js bucket-stat $HOSTADDRESS$ $ARG1$
}
define service {
  service_description check_couchbase_cluster
  check_command       check_couchbase_cluster!172.0.0.1 -u username -p password
}
define service {
  service_description check_couchbase_node
  check_command       check_couchbase_node!172.0.0.1 -u username -p password
}
define service {
  service_description check_couchbase_bucket
  check_command       check_couchbase_bucket!172.0.0.1 bucketName -u username -p password
}
define service {
  service_description check_couchbase_bucket_stat
  check_command       check_couchbase_bucket_stat!172.0.0.1 bucketName statName -u username -p password
}
```
