// auth.js
// sample DID: did:mdip:test:z3v8Auahtk8xg6uwsnuE1i49n9sCAyKiSEBiAxeC173U6qKrsx1
const user = require("../model/user")
const myshell = require('@travist/async-shell');

exports.register = async (req, res, next) => {
    const { username, userdid } = req.body
    if (userdid.length < 62) {
        return res.status(400).json({ message: "DID is required"})
    }
    try {
        await user.create({
            username,
            userdid
        }).then(user =>
            res.status(200).json({
                message: "User successfully registered",
                user,
            })
        )
    } catch (err) {
        res.status(401).json({
            message: "User registration failed", 
            error: error.message
        })
    }
}  

exports.login = async (req, res, next) => {
    try {
        const { userdid, authdid } = req.body
        if (!authdid) {
            return res.status(401).json({
                message: "Authentication challenge response DID required"
           })
        } else {
            const authuser = await user.findOne({ userdid })
            if (!authuser) {
                res.status(401).json({
                    message: "Login not successful",
                    error: "User not found"
                })
            } else {
                res.status(200).json({
                    message: "Login successful",
                    authuser,
                   // resolvedid
                })
            }
        } 
    } catch (error) {
        res.status(400).json({
            message: "An error occurred", 
            error: error.message
        })
    }
}

exports.login2 = async (req, res, next) => {
    try { // STEP 1: Check that the authentication DID provided looks good
        const { userdid, authdid } = req.body
        if (!authdid || authdid.len < 60 || authdid.len > 65) {
            res.status(401).json({
                message: "Login not successful",
                error: "Invalid DID provided"
            })
        } else { // STEP 2: Resolve the auth DID using the local kc CLI
            const resolvedid = JSON.parse(await myshell(`kc-proxy.sh resolve-did ${authdid}`));
            console.log(resolvedid)
            if (resolvedid.error) {
                res.status(401).json({
                    message: "DID not resolved",
                    error: "Error while resolving DID"
                })
            } else { // STEP 3: Decrypt the auth DID to validate the response
                const decryptdid = JSON.parse(await myshell(`kc-proxy.sh decrypt-json ${authdid}`))
                

                if (!decryptdid.match) {
                    res.status(400).json({
                        message: "Response mismatch",
                        error: decryptdid.error
                    })
                } else { // STEP 4: Check that the auth DID responds to a recent challenge
                    const validchallenge = JSON.parse(await myshell(`kc-proxy.sh resolve-did ${decryptdid.challenge}`))
                    var sessionTime = new Date(validchallenge.didDocumentMetadata.created)
                    var now = new Date()
                    console.log(`sessionTime: ${sessionTime}`)
                    console.log(`date: ${now}`)
                    console.log(now - sessionTime)
                    if (now - sessionTime > 6000000) {
                        res.status(400).json({
                            message: "Session timeout",
                            error: "Challenge DID is too old"
                        })            
                    } else { // STEP 5: Check that the user's DID is in our database
                        console.log(`userdid: ${userdid}`)
                        console.log(`controller: ${resolvedid.didDocument.controller}`)
                        const authuser = await user.findOne({userdid: `${resolvedid.didDocument.controller}`})
                        if (!authuser) {
                            res.status(401).json({
                                message: "Login not successful",
                                error: "User not found"
                            })
                        } else { // ALL IS GOOD - Let the user in
                            res.status(200).json({
                                message: "Login successful!",
                                userdid: resolvedid.didDocument.controller,
                                challengedid: decryptdid.challenge
                            })
                        }
                    }
                }
            }
        }
    } catch (error) {
        res.status(400).json({
            message: "Invalid DID or DID Document",
            error: error.message
        })
    } 
}