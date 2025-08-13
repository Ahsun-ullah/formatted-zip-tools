import Dexie, { Table } from 'dexie';

export interface SavedBackground {
  id?: number;
  name: string;
  dataUrl: string;
  type: 'image' | 'text'; // To distinguish between background types
}

export class MySubClassedDexie extends Dexie {
  backgrounds!: Table<SavedBackground>;

  constructor() {
    super("myDatabase"); // Use original name to restore data

    // Define version 2 with the new 'type' field and an upgrade path
    this.version(2).stores({
      backgrounds: "++id, name, type",
    }).upgrade(tx => {
      // This function runs only if the database is upgrading from a version < 2
      // For existing backgrounds that don't have a type, we default it to 'image'
      return tx.table("backgrounds").toCollection().modify(bg => {
        if (bg.type === undefined) {
          bg.type = 'image';
        }
      });
    });

    // Define version 1 for databases that might not have been upgraded yet
    this.version(1).stores({
      backgrounds: '++id, name' 
    });
  }
}

export const db = new MySubClassedDexie();
