// src/models/UserToken.js
import mongoose from "mongoose";

const userTokenSchema = new mongoose.Schema(
  {

    phoneNumber: {
      type: String,
      required: true,
      unique: true,
    },
    emailAddress: {
      type: String,
      required: true,
    },
    google: {
      accessToken: {
        type: String,
        required: true,
      },
      refreshToken: {
        type: String,
        required: true,
      },

      historyId: { type: String },
      watchExpiry: { type: Date },
      expiryDate: {
        type: Date, // store expiry so you know when to refresh
        required: true,
      },
    },
  },
  { timestamps: true },
);

export const UserToken = mongoose.model("UserToken", userTokenSchema);
