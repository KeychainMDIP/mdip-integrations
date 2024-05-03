// user.js
const mongoose = require("mongoose")
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true
    },
    userdid: {
        type: String,
        unique: true,
        required: true
    },
    role: {
        type: String,
        default: "Basic",
        required: true
    }
})

const user = mongoose.model("user", userSchema)
module.exports = user