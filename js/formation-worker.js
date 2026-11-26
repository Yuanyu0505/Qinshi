'use strict';
importScripts('formations.js');
self.onmessage=function(event){try{self.postMessage({result:self.FORMATIONS.recommendFormation(event.data.formation,event.data.progress,event.data.options)});}catch(error){self.postMessage({error:error.message});}};
