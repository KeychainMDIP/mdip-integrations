const mongoose = require("mongoose")
const localDB = "mongodb://192.168.1.35:27017/mdipauth"
const connectDB = async () => {
    await mongoose.connect(localDB)
    console.log(`Database connected to ${localDB}`)
}
module.exports = connectDB