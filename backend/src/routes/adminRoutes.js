const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (email === "admin@gmail.com" && password === "admin@9572") {
    const token = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: "12h",
    });
    return res.json({ token });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

module.exports = router;
