'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('light',{
  state:()=>ipcRenderer.invoke('lf:state'),
  action:(name,value)=>ipcRenderer.invoke('lf:action',{name,value}),
  subscribe:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('lf:state',listener);return()=>ipcRenderer.removeListener('lf:state',listener);}
});
