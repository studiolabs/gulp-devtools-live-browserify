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
	this.stream = null;
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

	this.file = {
		path : this.src,
		src : this.src,
		url : browserifyUnpack.loaderUrl,
		deps : []
	};

	this.devtoolsLive = devtoolsLive;

	return this.load();

};

BrowserifyDevTools.prototype.loadMap = function(map) {
	process.live['browserify'] = "";
	var today = new Date().getTime();
	var html = [];
	var urls = [];
	map.push(this.file);
	for (var i in map) {
		map[i].plugin = this;
		map[i].output = this.output +'/' + map[i].url;
		var line =  "<script type='text/javascript' src='/"+map[i].url+"?"+today+"'></script>\n";

		process.live['browserify'] += line;

		if(this.devtoolsLive.registerFile(map[i]) == false){
			html.push({
				attributes : {
					src : '/'+map[i].url+"?"+today,
					type : 'text/javascript'
				},
				tag : 'script'
			});
			urls.push(map[i].url);
		}
	}

	return { html : html, urls: urls };
};

BrowserifyDevTools.prototype.load = function(update) {
	var  browserifyDevToolsTmpFile = new BrowserifyDevToolsFile(this.devtoolsLive, this.file);
	var stream = browserifyDevToolsTmpFile.createWriteStream(this.saveLoader.bind(this), update);
	this.cmd(this.file.src, stream, this.devtoolsLive.onError, []);
	return stream;
};

BrowserifyDevTools.prototype.saveLoader = function (browserifyContent, update) {

	var browserifyOutput = browserifyUnpack.unpack(browserifyContent);
	var data = this.loadMap(browserifyOutput.map);

	this.file.sync = browserifyOutput.loaderContent;

	if(update !== undefined){
		var record = {
			action: 'urls',
			data : data,
			next : {
				url :  this.file.url,
				update : update
			}
		};

		this.devtoolsLive.broadcast(record);
	}

	if(this.stream !== undefined){
		this.devtoolsLive.streamFinished(this);
	}
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
			url: this.file.url
		};

		if (this.file.content === undefined) {
			record.sync = this.file.src;
		} else {
			record.resourceName = this.file.src;
			delete this.file.content;
		}

		record.event = this.file.src;

		var browserifyFile = browserifyUnpack.extract(this.file, browserifyContent);

		if(browserifyFile !== undefined){
			var fileContent = this.file.line +
				'\n' + browserifyFile.content + '\n' +
			'}'+'\n'+ browserifyFile.mapInline ;

			this.file.deps.map(function(value, index){
				if(browserifyFile.info.deps[index] !== undefined){
					browserifyFile.info.deps[index] = value;
				}
			});

			var result = Immutable.Map(browserifyFile.info.deps);
			var equals = Immutable.is(this.file.deps, result);

			this.file.deps = result;

			record.content = fileContent ;
			record.deps = equals;

			process.fs.writeFileSync(this.file.output, record.content);

			if(equals == false){
				this.file.plugin.load(record);
			}else{
				this.devtoolsLive.broadcast(record);
			}

		}

};


BrowserifyDevToolsFile.prototype.createWriteStream  = function(next,record) {

    var data = []; // We'll store all the data inside this array
    var writeStream = function (chunk) {
      data.push(chunk);
    };
    var endStream  = function() {
    	var content = Buffer.concat(data).toString();
    	if(next !== undefined){
    		return next(content, record);
    	}else{
    		return this.saveFile(content);
    	}
	    // Will be emitted when the input stream has ended, ie. no more data will be provided

    }.bind(this);

    return ES.through(writeStream, endStream);
};


module.exports = BrowserifyDevTools;
