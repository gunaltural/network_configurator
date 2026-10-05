import unittest
from app import app, apply_istack_configuration, device_type, live_command_list
from fastapi.testclient import TestClient
class IStackAdapter(unittest.TestCase):
 def test_assets_and_platform(self):
  self.assertEqual(device_type('Huawei iStack',live=True),'huawei')
  self.assertEqual(live_command_list('Huawei iStack','display stack\ndisplay mad'),['display stack','display mad'])
  self.assertEqual(TestClient(app).get('/huawei-istack.js').status_code,200)
 def test_mad_confirmation_only(self):
  class Conn:
   def __init__(self): self.sent=[];self.exited=False
   def config_mode(self): pass
   def exit_config_mode(self): self.exited=True
   def send_command_timing(self,cmd,**kw):
    self.sent.append(cmd)
    return 'Continue? [Y/N]' if cmd=='mad detect mode direct' else '[CORE]'
  c=Conn();apply_istack_configuration(c,['system-view','sysname CORE','interface GigabitEthernet0/0/24','mad detect mode direct','quit','return']);self.assertIn('y',c.sent);self.assertNotIn('system-view',c.sent);self.assertTrue(c.exited)
 def test_unexpected_prompt_stops(self):
  class Conn:
   def config_mode(self): pass
   def exit_config_mode(self): pass
   def send_command_timing(self,*a,**kw): return 'Continue? [Y/N]'
  with self.assertRaisesRegex(RuntimeError,'Unexpected'): apply_istack_configuration(Conn(),['sysname CORE'])
if __name__=='__main__': unittest.main()
