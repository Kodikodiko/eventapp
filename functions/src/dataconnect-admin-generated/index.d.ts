import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface Category_Key {
  id: UUIDString;
  __typename?: 'Category_Key';
}

export interface CreateNoteData {
  note_insert: Note_Key;
}

export interface CreateNoteVariables {
  tbdItemId: UUIDString;
  content: string;
  userId: UUIDString;
}

export interface CreateTbdItemData {
  tBDItem_insert: TBDItem_Key;
}

export interface CreateTbdItemVariables {
  title: string;
  status: string;
  userId: UUIDString;
}

export interface ListTbdItemsForUserData {
  tBDItems: ({
    id: UUIDString;
    title: string;
    status: string;
    priority?: string | null;
    description?: string | null;
    tentativeDueDate?: DateString | null;
    category?: {
      id: UUIDString;
      name: string;
    } & Category_Key;
      notes_on_tbdItem: ({
        id: UUIDString;
        content: string;
        createdAt: TimestampString;
      } & Note_Key)[];
  } & TBDItem_Key)[];
}

export interface ListTbdItemsForUserVariables {
  userId: UUIDString;
}

export interface Note_Key {
  id: UUIDString;
  __typename?: 'Note_Key';
}

export interface TBDItem_Key {
  id: UUIDString;
  __typename?: 'TBDItem_Key';
}

export interface UpdateTbdItemStatusData {
  tBDItem_update?: TBDItem_Key | null;
}

export interface UpdateTbdItemStatusVariables {
  id: UUIDString;
  status: string;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

/** Generated Node Admin SDK operation action function for the 'CreateTbdItem' Mutation. Allow users to execute without passing in DataConnect. */
export function createTbdItem(dc: DataConnect, vars: CreateTbdItemVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateTbdItemData>>;
/** Generated Node Admin SDK operation action function for the 'CreateTbdItem' Mutation. Allow users to pass in custom DataConnect instances. */
export function createTbdItem(vars: CreateTbdItemVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateTbdItemData>>;

/** Generated Node Admin SDK operation action function for the 'ListTbdItemsForUser' Query. Allow users to execute without passing in DataConnect. */
export function listTbdItemsForUser(dc: DataConnect, vars: ListTbdItemsForUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListTbdItemsForUserData>>;
/** Generated Node Admin SDK operation action function for the 'ListTbdItemsForUser' Query. Allow users to pass in custom DataConnect instances. */
export function listTbdItemsForUser(vars: ListTbdItemsForUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListTbdItemsForUserData>>;

/** Generated Node Admin SDK operation action function for the 'CreateNote' Mutation. Allow users to execute without passing in DataConnect. */
export function createNote(dc: DataConnect, vars: CreateNoteVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateNoteData>>;
/** Generated Node Admin SDK operation action function for the 'CreateNote' Mutation. Allow users to pass in custom DataConnect instances. */
export function createNote(vars: CreateNoteVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateNoteData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateTbdItemStatus' Mutation. Allow users to execute without passing in DataConnect. */
export function updateTbdItemStatus(dc: DataConnect, vars: UpdateTbdItemStatusVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateTbdItemStatusData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateTbdItemStatus' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateTbdItemStatus(vars: UpdateTbdItemStatusVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateTbdItemStatusData>>;

