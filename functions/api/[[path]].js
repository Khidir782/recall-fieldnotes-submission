import { handleApi } from "../../server/app.js";
export const onRequest = ({ request, env }) => handleApi(request, env);
