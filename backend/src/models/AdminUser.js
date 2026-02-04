const mongoose = require("mongoose");

const AdminUserSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true },
    passwordHash: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminUser", AdminUserSchema);
