const express = require("express")
const router = express.Router()
const { register, login, login2 } = require("./auth")

router.route("/register").post(register)
router.route("/login").post(login)
router.route("/login2").post(login2)

module.exports = router
