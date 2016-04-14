'use strict';

var path = require('path');
var fs = require('fs');
var utf8 = require('utf8');
var combineSourceMap = require('combine-source-map');
var BrowserifyUnpack = require('browserify-unpack');
var through2 = require('through2');
var ES = require('event-stream');
var baseStream = require('stream');
var Immutable = require('immutable');

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
	this.cmd(file.path, browserifyDevToolsTmpFile.createWriteStream(), devtoolsLive.onError, file.externals);
};

function BrowserifyDevToolsFile( devtoolsLive, file){
	this.file = file;
	this.devtoolsLive = devtoolsLive;
}

BrowserifyDevToolsFile.prototype.saveFile = function (browserifyContent) {

		var record = {
			action: 'update',
			url: this.devtoolsLive.getClientPageUrl() + this.file.url
		};

		if (this.file.content === undefined) {
			record.sync = this.devtoolsLive.getClientHostname() + '/' + this.file.src;
		} else {
			record.resourceName = this.devtoolsLive.getClientHostname() + '/' + this.file.src;
			delete this.file.content;
		}

		record.event = this.file.src;

		var browserifyFile = browserifyUnpack.extract(this.file, browserifyContent);

		if(browserifyFile !== undefined){
			var fileContent = this.file.line +
				'\n' + browserifyFile.content + '\n' +
			'}'+ '\n'+ browserifyFile.mapInline;

			this.file.deps.map(function(value, index){
				if(browserifyFile.info.deps[index] !== undefined){
					browserifyFile.info.deps[index] = value;
				}
			});

			console.log('file', this.file.deps);
			console.log('browserifyFile', browserifyFile.info.deps);

			var result = Immutable.Map(browserifyFile.info.deps);
			var equals = Immutable.is(this.file.deps, result);

			this.file.deps = result;

			record.content = fileContent ;
			this.devtoolsLive.broadcast(record);

			process.fs.writeFileSync(this.file.output, record.content);

		}

};


BrowserifyDevToolsFile.prototype.createWriteStream  = function() {

    var data = []; // We'll store all the data inside this array
    var writeStream = function (chunk) {
      data.push(chunk);
    };
    var endStream  = function() { // Will be emitted when the input stream has ended, ie. no more data will be provided
      this.saveFile(Buffer.concat(data).toString());
    }.bind(this);

    return ES.through(writeStream, endStream);
};


module.exports = BrowserifyDevTools;
