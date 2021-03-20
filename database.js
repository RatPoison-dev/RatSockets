const sqlite3 = require('better-sqlite3')
const db = new sqlite3("db/database.sqlite3", {
    readonly: false
})


let run = (q, ...args) => db.prepare(q).run(...args)
let get = (q, ...args) => db.prepare(q).all(...args)
let one = (q, ...args) => db.prepare(q).get(...args)

run("create table if not exists lobbies (lobbyID text not null, steamID text not null, team text not null)")
run("create table if not exists userData (steamID text not null, data text)")

module.exports = {run, get, one}