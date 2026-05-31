import mongoose from "mongoose";

const scheduledJobSchema = new mongoose.Schema({
  phoneNumber: String,
  waMessageId: String,
  task: String,
  type: { type: String, enum: ["once", "recurring"] },
  scheduledAt: Date,
  cronExpr: String,
  status: {
    type: String,
    enum: ["pending", "done", "cancelled"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
});

export const ScheduledJob = mongoose.model("ScheduledJob", scheduledJobSchema);
