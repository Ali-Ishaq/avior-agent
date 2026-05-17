import mongoose from "mongoose";

export const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGO_URI);
  console.log(`MongoDB connected: ${conn.connection.host}`);

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB error:", err.message);
  });
};

export const getMongoClient = () => {
  return mongoose.connection.getClient();
};

export const closeDB = async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed");
};
