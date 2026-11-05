import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import knowledge_store

class KnowledgeStoreTests(unittest.TestCase):
    def test_seeded_persistent_catalog_queries_and_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"engineer.sqlite3"
            with patch.object(knowledge_store,"_DB",path):
                doc=knowledge_store.get_stp_knowledge()
                self.assertEqual(doc["module"],"STP")
                self.assertGreaterEqual(len(doc["records"]),15)
                self.assertGreaterEqual(len(doc["sources"]),10)
                self.assertTrue(path.is_file())
                self.assertTrue(any(r["id"]=="campus.vtp" and "campusVtp" in r["designFields"] for r in doc["records"]))
                self.assertTrue(any(r["id"]=="stp.root_priority" and "stpRootPri" in r["designFields"] for r in doc["records"]))
                self.assertTrue(any(r["id"]=="campus.native_vlan" and "campusNativeVlan" in r["designFields"] for r in doc["records"]))
                again=knowledge_store.get_stp_knowledge()
                self.assertEqual(doc,again)
    def test_sources_have_traceability_and_no_unbound_reference(self):
        doc=knowledge_store.get_stp_knowledge()
        sources={s["id"] for s in doc["sources"]}
        self.assertEqual(len(sources),len(doc["sources"]))
        for record in doc["records"]:
            self.assertTrue(record["origin"])
            self.assertTrue(record["context"])
            self.assertTrue(record["analysis"])
            self.assertTrue(set(record["sources"])<=sources)

if __name__=="__main__":
    unittest.main()
