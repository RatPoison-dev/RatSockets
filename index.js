const WebSocket = require('ws');
const database = require("./database")
const wss = new WebSocket.Server({ port: 8080 });
//const myWsClient = new WebSocket("ws://localhost:8060")
const v4 = require("uuid").v4
const onExit = require("exit-hook")
console.log("Starting WebSocket Server..")

let exitFun = () => {
    database.get("select * from lobbies").forEach(values => {
        database.run("delete from lobbies where steamID = ?", [values.steamID])
        database.run("delete from userData where steamID = ?", [values.steamID])
    })
}
onExit(() => {
    exitFun()
})

process.on("uncaughtException", () => {
    exitFun()
    process.exit(0)
})

const sid2wc = {}
let wc2sid = (wc) => {
    let ret
    Object.keys(sid2wc).forEach(it => {
        if (sid2wc[it] == wc) {ret = it; return}
    })
    return ret
}

const apiVersion = "v1.0"

class LobbyManager {
    createLobbyIfNotExists(sID, team) {
        let s = this.getLobbyBySID(sID)
        if (!s) {
            let generated = v4()
            database.run("insert into lobbies (lobbyID, steamID, team) values (?, ?, ?)", [generated, sID, team])
            database.run("insert into userData (steamID) values (?)", [sID])
        }   
    }
    getLobbyBySID(sID) {
        return database.one("select * from lobbies where steamID = ?", [sID])
    }
}

let manager = new LobbyManager()

let deleteInfoAbout = (wsClient) => {
    let sid = wc2sid(wsClient)
    if (!sid) return
    database.run("delete from lobbies where steamID = ?", [sid])
    database.run("delete from userData where steamID = ?", [sid])
    delete sid2wc[sid]
}

wss.on("listening", () => {
    console.log("Server started!")
})

let attemptResetWc = (wsClient, sid) => {
    let mySID = wc2sid(wsClient)
    if (!mySID) return true
    return mySID == sid
}
wss.on("connection", (wsClient) => {
    wsClient.on("close", () => {
        deleteInfoAbout(wsClient)
    })
    wsClient.on("message", (message) => {
        /*  exchange protocol
            splliter command additional data
        */
        message = message.replace(" ", "")
        let splitter = message[0]
        if (![":", ","].includes(splitter)) { //set to default
            splitter = ":"
            message = ":" + message
        }
        message = message.slice(1)
        let data = message.split(splitter)
        let command = data[0]
        if (!command) return
        switch (command) {
            case "deleteInfo": {
                deleteInfoAbout(wsClient)
                break
            }
            case "version": {
                wsClient.send(apiVersion)
                break
            }
            //case "addSID": {
            //    let j = {"command": "addSID"}
            //    let tmpDiscordID = data[1]
            //    if (!tmpDiscordID) return
            //    j["data"] = data.slice(2)
            //    myWsClient.send(JSON.stringify(j))
            //}
            case "iterateEntities": {
                let mySID = data[1]
                let myTeam = data[2]
                if (!mySID || !myTeam) {wsClient.send(""); return}
                let attempt = attemptResetWc(wsClient, mySID)
                if (!attempt) {wsClient.send(""); return}
                manager.createLobbyIfNotExists(mySID, myTeam)
                database.run("update lobbies set team = ? where steamID = ?", [myTeam, mySID])
                sid2wc[mySID] = wsClient
                let myLobby = manager.getLobbyBySID(mySID)
                let all = ""
                let realData = data.slice(3)
                realData.forEach((sID, idx) => {
                    if (idx % 3 != 0) return
                    let tmpLobby = manager.getLobbyBySID(sID)
                    if (!tmpLobby) return
                    if (tmpLobby.team == myLobby.team) {
                        database.run("update lobbies set lobbyID = ? where steamID = ?", [tmpLobby.lobbyID, mySID])
                        myLobby = tmpLobby
                    }
                })
                database.run("update userData set data = ? where steamID = ?", [realData.join(":"), mySID])
                
                database.get("select * from lobbies where lobbyID = ?", [myLobby.lobbyID]).forEach(player => {
                    if (player.steamID != mySID) {
                        let tmpGet = database.one("select data from userData where steamID = ?", [player.steamID])
                        if (!tmpGet) return
                        let splitArr = tmpGet.data.split(":")
                        //console.log(splitArr)
                        splitArr.forEach((sID, idx) => {
                            if (idx % 2 != 0) return
                            all += `${sID}:`
                            let tmpGet2 = splitArr[idx + 1]
                            if (tmpGet2 == undefined) return
                            let nextVec = tmpGet2.match(/[+-]?\d+(\.\d+)?/g)
                            all += `${nextVec[0]}:${nextVec[1]}:${nextVec[2]}:`
                        })
                    }
                })
                wsClient.send(all)
            }
            break
        }
    })
})