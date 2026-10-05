import { act } from '@/app/probe116/let-actions';
import { actReq } from '@/app/probe116/req-actions';
import { actModReq } from '@/app/probe116/modreq-actions';
import { actCreq } from '@/app/probe116/creq-actions';
import { actReqAs } from '@/app/probe116/reqas-actions';
import { Probe } from '@/app/probe116/probe-client';
export default function Page() {
  return <Probe run={act} act={act} actReq={actReq} actModReq={actModReq} actCreq={actCreq} actReqAs={actReqAs} />;
}
