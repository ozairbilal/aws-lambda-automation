'use strict'

const fs = require('fs-extra');
const osenv = require('osenv');
const http = require('http');
const async = require('async');
const AWS = require('aws-sdk');
exports.handler =  async (event) => {


// Setup and determine some variables
var ipaddress_old;
var ipaddress_new;
var homedir = osenv.home();
var program = JSON.parse(JSON.stringify(event.queryStringParameters));
program.secgroup = "sg-Your Security Group"
program.region = "eu-west-1"

if (program.secgroup === '') {
   console.error('No security group given!');
   process.exit(1);
}
console.log('Region: %s', program.region);
console.log('Security Group: %s', program.secgroup);

// Setup AWS API version and region
AWS.config.apiVersions = {
  ec2: '2015-10-01',
};
AWS.config.update({
  region: program.region
});

// get our external IP
ipaddress_new = event.requestContext.identity.sourceIp

async.series([
  function (callback) {
    http.get({'host': 'api.ipify.org', 'port': 80, 'path': '/'}, function (resp) {
      resp.on('data', function (ip) {
        ipaddress_new = ip;
        return callback();
      });
    });
  },

  // first we check for existing file and make a backup if needed
  function (callback) {
    fs.exists(homedir + '/.amazonip', function (fileExists) {
      if (fileExists) {
        ipaddress_old = fs.readFileSync(homedir + '/.amazonip', 'utf8');
        fs.copySync(homedir + '/.amazonip', homedir + '/.amazonip.old');
      }
      return callback();
    });
  },

  // write new IP to our file
  function (callback) {
    fs.writeFile(homedir + '/.amazonip', ipaddress_new, function (err) {
      if (err) {
        return callback(err);  
      }
      return callback();  
    });
  },

  // compare old and new IPs and if they are the same and we aren't forcing update we can exit
  function (callback) {
    console.log(ipaddress_old);
    console.log(ipaddress_new.toString());

    if (typeof ipaddress_old !== undefined && ipaddress_old.toString() === ipaddress_new.toString() && !program.force) {
      console.log('No update required');
      process.exit(0);
    } else {
      return callback();
    }
  },

  // remove old IP from security group
  function (callback) {
    var ec2 = new AWS.EC2();
    var params = {
      CidrIp: ipaddress_old + '/32',
      DryRun: false,
      FromPort: 22,
      GroupId: program.secgroup,
      IpProtocol: 'TCP',
      ToPort: 22
    };

    ec2.revokeSecurityGroupIngress(params, function(err, data) {
      if (err) {
        console.log('Error removing old IP address from security group');
        console.log(err, err.stack);
      }
      return callback();
    });
  },

  // add new IP
  function (callback) {
    var ec2 = new AWS.EC2();
    var params = {
      CidrIp: ipaddress_new + '/32',
      DryRun: false,
      FromPort: 22,
      GroupId: program.secgroup,
      IpProtocol: 'TCP',
      ToPort: 22
    };

    ec2.authorizeSecurityGroupIngress(params, function(err, data) {
      if (err) {
        console.log('Error adding new IP address from security group');
        return callback(err);
      }
      return callback();
    });
  }
],

// function (err, results) {
//   if (err) {
//     console.log('Error: ' + JSON.stringify(err));
//   } else {
//     console.log('IP address updated');
//   }
//   process.exit(0);
// }
);


let responseBody = {
    message: event.requestContext.identity.sourceIp,
    input: event
};

let responseCode = 200;
console.log("request: " + JSON.stringify(event));
let response = {
    statusCode: responseCode,
    headers: {
        "x-custom-header" : "my custom header value"
    },
    body: JSON.stringify(responseBody)
};
console.log("response: " + JSON.stringify(response))
return response;
    
};
