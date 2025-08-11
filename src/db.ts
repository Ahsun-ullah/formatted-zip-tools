import Dexie, { Table } from 'dexie';

export interface SavedBackground {
  id?: number; // Primary key, auto-incremented
  name: string;
  dataUrl: string;
}

export class MySubClassedDexie extends Dexie {
  backgrounds!: Table<SavedBackground>;

  constructor() {
    super('zipCleanerDb');
    this.version(1).stores({
      backgrounds: '++id, name' // Primary key 'id' and indexed prop 'name'
    });
  }
}

export const db = new MySubClassedDexie();
