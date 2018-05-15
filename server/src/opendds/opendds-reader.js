import opendds from 'opendds';
import path from 'path';
import fs from 'fs';

function ValveDataReader() {
  this.valveReader = null;
  this.factory = null;
  this.library = null;
}

// Topics is "Valve"
// Symbols uses transient-local durability, otherwise QoS is default
ValveDataReader.prototype.subscribe = function(sample_received) {
  var qos = {
    DataReaderQos: { durability: "TRANSIENT_LOCAL_DURABILITY_QOS" }
  };
  try {
    this.valveReader =
      this.participant.subscribe(
        'Valve',
        'Nexmatix::ValveData',
        qos,
        function(dr, sInfo, sample) {
          if (sInfo.valid_data) {
            sample.source_timestamp = sInfo.source_timestamp;
            sample_received(sample);
          }
        }
      );

  } catch (e) {
    console.log(e);
  }
};


ValveDataReader.prototype.finalizeDds = function() {
  if (this.factory) {
    console.log("finalizing DDS connection");
    if (this.participant) {
      this.factory.delete_participant(this.participant);
      delete this.participant
    }
    opendds.finalize(this.factory);
    delete this.factory;
  }
};

ValveDataReader.prototype.initializeDds = function(configFile) {
  var DOMAIN_ID = 23;
  console.log('before apply');

  fs.readFile(configFile, 'utf8', function(err, contents) {
    console.log(contents);
  });

  console.log(JSON.stringify(process.env.DYLD_LIBRARY_PATH));
  this.factory = opendds.initialize('-DCPSConfigFile', configFile);
  console.log('after apply');
  this.library = opendds.load(path.join('..', 'lib', 'Nexmatix'));
  console.log('Nexmatix lib loaded');
  if (!this.library) {
    throw new Error("Could not open type support library");
  }
  console.log("creating participant");
  this.participant = this.factory.create_participant(DOMAIN_ID);
  console.log("created participant");
  // Handle exit gracefully
  var self = this;
  process.on('SIGINT', function() {
    console.log("OnSIGINT");
    self.finalizeDds();
    process.exit(0);
  });
  process.on('SIGTERM', function() {
    console.log("OnSIGTERM");
    self.finalizeDds();
    process.exit(0);
  });
  process.on('exit', function() {
    console.log("OnExit");
    self.finalizeDds();
  });
};


module.exports = ValveDataReader;