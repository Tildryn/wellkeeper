import { createContext } from "react";

const EditLockContext = createContext<((active: boolean) => void) | null>(null);

export default EditLockContext;
