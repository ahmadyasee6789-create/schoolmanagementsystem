import { api } from "./api";

// this instance always has the token

export const getInvitations = async () => {
  const res = await api.get("/organization/invitations");
  return res.data;
};

export const sendInvitation = async (data: { email: string; role: string }) => {
  const res = await api.post("/organization/invitations", data);
  
  return res.data;
};

export const deleteInvitation = async (id: number) => {
  const res = await api.delete(`/organization/invitations/${id}`);
  return res.data;
};

export const acceptInvitation = async (data: { token: string; password?: string }) => {
  const res = await api.post("/organization/invitations/accept", data);
  return res.data;
};
