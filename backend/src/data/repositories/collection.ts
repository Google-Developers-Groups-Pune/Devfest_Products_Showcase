import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  UpdateData,
} from 'firebase-admin/firestore';
import { paths } from '../paths.js';
import { DuplicateDocumentError, isAlreadyExists } from './errors.js';

function converter<T extends DocumentData>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data) => data as DocumentData,
    fromFirestore: (snapshot: QueryDocumentSnapshot) => snapshot.data() as T,
  };
}

/** Typed access to one collection. */
export interface CollectionRepository<T extends DocumentData> {
  readonly collection: CollectionReference<T>;
  ref(id: string | number): DocumentReference<T>;
  get(id: string | number): Promise<T | undefined>;
  /** Fails with DuplicateDocumentError if the document already exists. */
  create(id: string | number, data: T): Promise<void>;
  set(id: string | number, data: T): Promise<void>;
  update(id: string | number, data: UpdateData<T>): Promise<void>;
  list(): Promise<Array<{ id: string; data: T }>>;
}

export function collectionRepository<T extends DocumentData>(
  db: Firestore,
  kind: string,
  collectionPath: string,
): CollectionRepository<T> {
  const collection = db.collection(collectionPath).withConverter(converter<T>());
  const ref = (id: string | number) => collection.doc(paths.docId(kind, id));

  return {
    collection,
    ref,
    async get(id) {
      const snapshot = await ref(id).get();
      return snapshot.exists ? snapshot.data() : undefined;
    },
    async create(id, data) {
      try {
        await ref(id).create(data);
      } catch (error) {
        if (isAlreadyExists(error)) throw new DuplicateDocumentError(kind, String(id));
        throw error;
      }
    },
    async set(id, data) {
      await ref(id).set(data);
    },
    async update(id, data) {
      await ref(id).update(data);
    },
    async list() {
      const snapshot = await collection.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
    },
  };
}

/** Typed access to one fixed document, such as system/eventStatus. */
export interface SingleDocRepository<T extends DocumentData> {
  readonly ref: DocumentReference<T>;
  get(): Promise<T | undefined>;
  set(data: T): Promise<void>;
}

export function singleDocRepository<T extends DocumentData>(
  db: Firestore,
  docPath: string,
): SingleDocRepository<T> {
  const ref = db.doc(docPath).withConverter(converter<T>());
  return {
    ref,
    async get() {
      const snapshot = await ref.get();
      return snapshot.exists ? snapshot.data() : undefined;
    },
    async set(data) {
      await ref.set(data);
    },
  };
}
