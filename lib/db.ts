import { MongoClient, Db, Collection, Document } from "mongodb";

const uri = process.env.DATABASE_URL;
if (!uri) {
  throw new Error("DATABASE_URL is not set");
}

const clientOptions = {};

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const createClient = () => new MongoClient(uri, clientOptions);

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = createClient().connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  clientPromise = createClient().connect();
}

export const getMongoClient = async (): Promise<MongoClient> => clientPromise;

export const getDb = async (dbName?: string): Promise<Db> => {
  const client = await getMongoClient();
  const resolvedName = dbName ?? process.env.MONGODB_DB ?? process.env.DATABASE_NAME;
  return resolvedName ? client.db(resolvedName) : client.db();
};

export const getCollection = async <TSchema extends Document = Document>(name: string): Promise<Collection<TSchema>> => {
  const db = await getDb();
  return db.collection<TSchema>(name);
};
