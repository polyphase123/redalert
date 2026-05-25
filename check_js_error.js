const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');

const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on("error", (err) => { console.error("PAGE ERROR:", err); });
virtualConsole.on("jsdomError", (err) => { console.error("JSDOM ERROR:", err); });
virtualConsole.on("log", (msg) => { console.log("PAGE LOG:", msg); });

const dom = new JSDOM(html, { 
    runScripts: "dangerously", 
    resources: "usable",
    virtualConsole 
});

setTimeout(() => {
    console.log("Checking simulation state...");
    try {
        dom.window.eval("renderTopologyView();");
    } catch (e) {
        console.error("MANUAL CALL ERROR:", e);
    }
    setTimeout(() => { process.exit(0); }, 2000);
}, 3000);
