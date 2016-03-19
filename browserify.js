'use strict';

var path = require('path');
var fs = require('fs');
var utf8 = require('utf8');
var combineSourceMap = require('combine-source-map');
var BrowserifyUnpack = require('browserify-unpack');
var through2 = require('through2');
var ES = require('event-stream');
var baseStream = require('stream');


var browserifyUnpack;

function BrowserifyDevTools(options) {
		this.src = path.resolve(options.src);
		this.cmd = options.cmd;
}

BrowserifyDevTools.prototype.init = function(devtoolsLive) {

		this.output = devtoolsLive.options.devtools.destination;
	  browserifyUnpack = new BrowserifyUnpack({
      file: this.src,
      output: devtoolsLive.options.devtools.destination,
      directory: devtoolsLive.options.devtools.directory,
      map : true,
      sourcemap:true,
      mkdir : process.fs.mkdirpSync.bind(process.fs),
  		write : process.fs.writeFileSync.bind(process.fs)
    });
	  this.devtoolsLive = devtoolsLive;
	  var map = browserifyUnpack.unpack();
    this.loadMap(map);
};

BrowserifyDevTools.prototype.loadMap = function(map) {
	process.live['browserify'] = "";
	var today = new Date().getTime();
	for (var i in map) {
		map[i].plugin = this;
		map[i].output = this.output +'/' + map[i].url;

		this.devtoolsLive.registerFile(map[i]);
		process.live['browserify'] += "\n<script type='text/javascript' src='/"+map[i].url+"?"+today+"'></script>";
	}

	process.live['browserify'] += "\n<script type='text/javascript' src='/loader.js?"+today+"'></script>";
};

BrowserifyDevTools.prototype.resolve = function(devtoolsLive, file) {

	var  browserifyDevToolsTmpFile = new BrowserifyDevToolsFile(devtoolsLive, file);

	this.cmd(file.path, browserifyDevToolsTmpFile.createWriteStream(), devtoolsLive.onError, file.deps);
};


function BrowserifyDevToolsFile( devtoolsLive, file){
	this.file = file;
	this.devtoolsLive = devtoolsLive;
}

BrowserifyDevToolsFile.prototype.saveFile = function (browserifyContent) {

		var record = {
			action: 'update',
			resourceURL: this.devtoolsLive.getClientPageUrl() + this.file.url
		};

		var originalFileContent = '';
		if (this.file.content === undefined) {
			originalFileContent = utf8.encode(fs.readFileSync(this.file.path).toString());
			record.sync = this.devtoolsLive.getClientHostname() + '/' + this.file.name;
		} else {
			originalFileContent = this.file.content;
			delete this.file.content;
			record.resourceName = this.devtoolsLive.getClientHostname() + '/' + this.file.name;
		}

		record.event = this.file.variable;

		this.file.sync = originalFileContent;

		var browserifyFile = browserifyUnpack.extract(this.file, browserifyContent);

		if(browserifyFile !== undefined){
			var fileContent = this.file.line +
				'\n' + browserifyFile.content + '\n' +
			'}'+ '\n'+ browserifyFile.mapInline;

			record.content = fileContent ;
			this.devtoolsLive.broadcast(record);

			process.fs.writeFileSync(this.file.output, record.content );

		}

};

BrowserifyDevToolsFile.prototype.createWriteStream = function(devtoolsLive, file) {

	var modifyFile = function(file) {
	 	this.saveFile(file.contents.toString());
  	}.bind(this);

	return ES.through(modifyFile);

};



module.exports = BrowserifyDevTools;
