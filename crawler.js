var fs = require("fs");
var https = require("https");
var http = require("http");
var async = require("async");
var commander = require("commander");
var ProgressBar = require("progress");

var iDone = 0;
var iErr  = 0;
var iTot  = 0;
var iNew  = 0; 
var reqOptions = null;
var albums = null;
var processedImages;
var loadedImages = new Array();
var bar = null;
var updateMode = false;

var q = async.queue(downloadImage, 1);
q.drain = function(){
  fs.writeFile(commander.id+"/processed.json", JSON.stringify(processedImages), completeProcess);
};


startProcessing();

function startProcessing(err){
  commander
  .usage("options")
  .option("-i, --id [value]", "User ID")
  .option("-a, --album <n>", "Album ID")
  .option("-u, --update", "Update mode")
  .parse(process.argv);
  
  if (!commander.id) {
    console.log("Use --help to see available options.");
    process.exit(0);
  }
  if (commander.update) updateMode = true;
  
  https.request({
    hostname: "api.vk.com",
    path: "/method/photos.getAlbums?owner_id="+commander.id+"&need_system=1&v=5.40",
    method: "GET",
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.8.1.13) Gecko/20080311 Firefox/2.0.0.13'
    }
  }, function(res){
    var data="";
    res.on("data", function(chunk){
      data += chunk;
    });
    res.on("end", function(){
      try{
        albums = JSON.parse(data);
      }
      catch(err){
        console.log("# Cannot parse received data.")
        throw new Error(err);
      }
      getAlbums();
    });
  }).on("error", function(err){
    console.log("# Cannot get list of albums for user "+commander.id+".");
    throw new Error(err);
  }).end();
}

function getAlbums(){
  if (commander.id && !commander.album){
    console.log("Albums for "+commander.id+":");
    for(var album in albums.response.items){
      console.log(albums.response.items[album].id+" : "+albums.response.items[album].title+"("+albums.response.items[album].size+")");
    }
  }
  else if (commander.id && commander.album){
    var found = false;
    for (var album in albums.response.items){
      if (albums.response.items[album].id == commander.album){
        found = true;
        processAlbum(album);
        break;
      }
    }
    if (!found){
      throw new Error("# Wrong album id.");
    }
  }
  else{
    throw new Error("# Wrong parameters. Use --help to see available options.");
  }
}

function processAlbum(album){
  console.log("Processing album "+commander.album+" of user "+commander.id+"...");
  iTot = albums.response.items[album].size;
  var requests = new Array();
  if (albums.response.items[album].size <= 1000){
    requests.push({
      hostname: "api.vk.com",
      path: "/method/photos.get?owner_id="+commander.id+"&album_id="+commander.album+"&v=5.40",
      method: "GET",
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.8.1.13) Gecko/20080311 Firefox/2.0.0.13'
      }
    });
  }
  else {
    for (var i = 0; i <= albums.response.items[album].size/1000; i++){
      requests.push({
        hostname: "api.vk.com",
        path: "/method/photos.get?owner_id="+commander.id+"&album_id="+commander.album+"&offset="+i*1000+"&count=1000&v=5.40",
        method: "GET",
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.8.1.13) Gecko/20080311 Firefox/2.0.0.13'
        }
      });
    }
  }
  bar = new ProgressBar("Collecting photos: [:bar] :percent", {width: 50, total: requests.length});
  async.each(requests, collectPhotos, function(err){
    if (err){
      console.log("# Error while collecting photos.")
      throw new Error(err);
    }
    else{
      if (loadedImages){
      fs.mkdir(commander.id, function(err){
        if (err && err.code != "EEXIST"){
          console.log("# Cannot create directory "+commander.id+".");
          throw new Error(err);
        }
        console.log("Collected "+loadedImages.length+" items.");
        if (err != null && err.code == "EEXIST"){
          console.log("Previous session found. Trying to resume...");
        }
        fs.readFile(commander.id+"/processed.json", function(err, data){
          if (err && err.code != "ENOENT"){
            console.log("# Cannot read session file.\n");
            throw new Error(err);
          }
          if ((err != null) && (err.code == "ENOENT")){
            console.log("Session file not found. Creating new one...")
            processedImages = new Array();
            fs.writeFile(commander.id+"/processed.json", processedImages, function(err){
              if (err){
                console.log("# Cannot create session file.");
                throw new Error(err);
              } 
              else{
                checkUpdates();
              }
            });
          }
          else{
            if (data.length > 0){
              try{
                processedImages = JSON.parse(data);
              }
              catch (err){
                console.log("# Error during reading session file.");
                throw new Error(err);
              }
            }
            else{
              processedImages = new Array();
            }
            checkUpdates();
          }
        });
      });
      }
      else {
        console.log("Nothing to download. Bye.");
        process.exit(0);
      }
    }
  });
}

function collectPhotos(options, callback){
  https.request(options, function(res) {
    var data = "";
    res.setEncoding("utf8");
    res.on("data", function(chunk){
      data += chunk;
    });
  
    res.on("end", function(){
      var loadedData = "";
      bar.tick();
      try{
        loadedData = JSON.parse(data);
      }
      catch(err){
        console.log("# "+err);
        callback(err);
      }
      loadedImages = loadedImages.concat(loadedData.response.items);
      callback(null);
    });
    res.on("error", function(err){
      bar.terminate();
      console.log("# Data receive error!");
      callback(err);
    })
  }).on("error", function(err){
      bar.terminate();
      console.log("# Cannot receive data from VK");
      callback(err);
  }).end();
};

function checkUpdates(){
  var toBeProcessed = new Array();
  var fileUpdateMode = "";
  if (updateMode){
      var currentDate = new Date();
      fileUpdateMode = "/update_"+currentDate.getUTCFullYear()+("0"+(currentDate.getMonth()+1)).slice(-2)+("0"+currentDate.getDate()).slice(-2);
  }
  bar = new ProgressBar("Checking updates: [:bar] :percent", {width: 50, total: loadedImages.length});
  for (var i=0; i<loadedImages.length; i++){
    var date=new Date(loadedImages[i].date*1000);
    var targetDirectory=date.getUTCFullYear()+("0"+(date.getMonth()+1)).slice(-2)+("0"+date.getDate()).slice(-2);
    var wasProcessed = false;
    for (var j=0; j<processedImages.length; j++){
      if (processedImages[j].id == loadedImages[i].id &&
          processedImages[j].owner_id == loadedImages[i].owner_id){
        wasProcessed = true;
        break;
      }
    }
    if (!wasProcessed){
      var workingObject = loadedImages[i];
      iNew+=1;
      workingObject.workingDirectory = commander.id+fileUpdateMode+"/"+targetDirectory;
      toBeProcessed.push(workingObject);
    }
    bar.tick();
  }
  if (toBeProcessed.length > 0){
    bar = new ProgressBar("Downloading: [:bar] :percent", {width: 50, total: toBeProcessed.length});
    if (updateMode){
      fs.mkdir(commander.id+fileUpdateMode, function(err){
        if (err) throw new Error(err);
      });
    }
    q.push(toBeProcessed);
  }
  else {
    q.drain();
  }
}

function downloadImage (workingObject, callback){
  var url="";
  if (workingObject.photo_2560 !== undefined){
    url = workingObject.photo_2560;
  }
  else if (workingObject.photo_1280 !== undefined){
    url = workingObject.photo_1280
  }
  else if (workingObject.photo_807 !== undefined){
    url = workingObject.photo_807
  }
  else if (workingObject.photo_604 !== undefined){
    url = workingObject.photo_604
  }
  else if (workingObject.photo_130 !== undefined){
    url = workingObject.photo_130
  };
  
  if (url !== ""){
    var fileName = workingObject.workingDirectory+url.substring(url.lastIndexOf("/"));
    if (url.substr(0,5) === "https"){
      fs.mkdir(workingObject.workingDirectory, function(err){
        if (err && err.code != "EEXIST"){
          bar.tick();
          iErr += 1;
          callback(err);
        }
        else{
          var file = fs.createWriteStream(fileName, {defaultEncoding: "binary"});
          https.get(url, function(res){
            if (res.statusCode=== 200){
              res.pipe(file);
            }
            file.on("finish", function(){
              file.close(function(err){
                bar.tick();
                if (err){
                  iErr += 1;
                }
                else{
                  iDone += 1;
                  processedImages.push({id: workingObject.id, owner_id: workingObject.owner_id});
                }
                callback(err);
              });
            });
          }).on("error", function(err){
            fs.unlink("test/test.png");
            iErr += 1;
            callback(err);
          });
        }
      });
    }
    else if (url.substr(0,5) === "http:"){
      fs.mkdir(workingObject.workingDirectory, function(err){
        if (err && err.code != "EEXIST"){
          bar.tick();
          iErr += 1;
          callback(err);
        }
        else{
          var file = fs.createWriteStream(fileName, {defaultEncoding: "binary"});
          http.get(url, function(res){
            if (res.statusCode=== 200){
              res.pipe(file);
            }
            file.on("finish", function(){
              file.close(function(err){
                bar.tick();
                if (err){
                  iErr += 1;
                }
                else{
                  iDone += 1;
                  processedImages.push({id: workingObject.id, owner_id: workingObject.owner_id});
                }
                callback(err);
              });
            });
          }).on("error", function(err){
            fs.unlink("test/test.png");
            iErr += 1;
            callback(err);
          });
        }
      });
    }
    else {
      callback();
    };
  };
}

function completeProcess(err){
  if (err) console.log("# Error writing session file.\n"+err);
  console.log("Images: "+iTot+" / New: "+iNew+" / Downloaded: "+iDone+" / Errors: "+iErr);
  console.log("Bye.");
  process.exit(0);
}
