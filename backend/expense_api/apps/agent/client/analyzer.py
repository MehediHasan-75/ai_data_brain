"""
Data Analysis and Intelligence Module

Provides intelligent data analysis, pattern recognition, and table matching capabilities.
"""

from typing import List, Dict, Any, Optional
import re


class DataAnalyzer:
    """Analyzes user queries and data patterns for intelligent matching."""
    
    def __init__(self, category_keywords: Dict[str, List[str]]):
        self.category_keywords = category_keywords
    
    def extract_intent(self, query: str) -> Dict[str, Any]:
        """Extract intent, entities, and context from query."""
        query_lower = query.lower()
        
        intent = {
            'type': self._detect_intent_type(query_lower),
            'categories': self._detect_categories(query_lower),
            'entities': self._extract_entities(query_lower),
            'time_references': self._extract_time_refs(query_lower),
            'confidence': self._calculate_intent_confidence(query_lower),
        }
        
        return intent
    
    def _detect_intent_type(self, query: str) -> str:
        """Detect query intent type."""
        if any(word in query for word in ['create', 'make', 'new', 'setup', 'start']):
            return 'create'
        elif any(word in query for word in ['show', 'get', 'list', 'display', 'fetch']):
            return 'retrieve'
        elif any(word in query for word in ['add', 'insert', 'record', 'log', 'enter']):
            return 'add'
        elif any(word in query for word in ['update', 'edit', 'change', 'modify']):
            return 'update'
        elif any(word in query for word in ['delete', 'remove', 'erase']):
            return 'delete'
        elif any(word in query for word in ['analyze', 'insight', 'trend', 'pattern', 'compare']):
            return 'analyze'
        else:
            return 'unknown'
    
    def _detect_categories(self, query: str) -> List[str]:
        """Detect data categories in query."""
        detected = []
        
        for category, keywords in self.category_keywords.items():
            if any(keyword in query for keyword in keywords):
                detected.append(category)
        
        return detected
    
    def _extract_entities(self, query: str) -> Dict[str, Any]:
        """Extract entities like amounts, dates, etc."""
        entities = {}
        
        # Extract amounts
        amount_match = re.search(r'(\d+)\s*(tk|taka|amount)', query)
        if amount_match:
            entities['amount'] = int(amount_match.group(1))
        
        # Extract dates
        entities['dates'] = self._extract_dates(query)
        
        return entities
    
    def _extract_dates(self, query: str) -> List[str]:
        """Extract date references."""
        dates = []
        
        date_keywords = {
            'today': ['ajk', 'today'],
            'yesterday': ['gotokal', 'yesterday'],
            'tomorrow': ['kal', 'tomorrow'],
        }
        
        for date_type, keywords in date_keywords.items():
            if any(keyword in query for keyword in keywords):
                dates.append(date_type)
        
        return dates
    
    def _extract_time_refs(self, query: str) -> Dict[str, str]:
        """Extract time period references."""
        refs = {}
        
        if any(word in query for word in ['daily', 'din', 'din']):
            refs['period'] = 'daily'
        elif any(word in query for word in ['monthly', 'mas', 'month']):
            refs['period'] = 'monthly'
        elif any(word in query for word in ['yearly', 'year', 'bocor']):
            refs['period'] = 'yearly'
        
        return refs
    
    def _calculate_intent_confidence(self, query: str) -> float:
        """Calculate confidence score for detected intent."""
        # Base confidence
        confidence = 0.5
        
        # Increase confidence based on specificity
        if len(query) > 20:
            confidence += 0.2
        if any(char.isdigit() for char in query):
            confidence += 0.15
        if query.count(',') > 0:
            confidence += 0.15
        
        return min(confidence, 1.0)


class TableMatcher:
    """Intelligent table matching based on query analysis."""
    
    def __init__(self):
        self.analyzer = DataAnalyzer({
            'expenses': ['khoroch', 'expense', 'cost', 'spent'],
            'location': ['sylhet', 'dhaka', 'travel'],
            'time': ['daily', 'monthly'],
            'inventory': ['inventory', 'stock'],
        })
    
    def find_best_match(self, tables: List[Dict], query: str) -> Optional[Dict[str, Any]]:
        """Find the best matching table for a query."""
        if not tables:
            return None
        
        intent = self.analyzer.extract_intent(query)
        
        scored_tables = []
        for table in tables:
            score = self._calculate_match_score(table, intent, query)
            scored_tables.append({
                'table': table,
                'score': score,
                'intent_match': score >= 0.6,
                'reasoning': self._get_match_reasoning(table, intent)
            })
        
        # Sort by score
        scored_tables.sort(key=lambda x: x['score'], reverse=True)
        
        best = scored_tables[0] if scored_tables else None
        return best if best and best['score'] > 0.3 else None
    
    def _calculate_match_score(self, table: Dict, intent: Dict, query: str) -> float:
        """Calculate matching score between table and intent."""
        score = 0.0
        table_name = table.get('table_name', '').lower()
        
        # Category matching
        for category in intent['categories']:
            if category.lower() in table_name:
                score += 0.4
        
        # Entity matching
        if 'amount' in intent['entities']:
            if 'expense' in table_name or 'cost' in table_name:
                score += 0.2
        
        # Time period matching
        if 'period' in intent['time_references']:
            period = intent['time_references']['period']
            if period in table_name:
                score += 0.2
        
        return min(score, 1.0)
    
    def _get_match_reasoning(self, table: Dict, intent: Dict) -> str:
        """Get reasoning for match score."""
        reasons = []
        
        if intent.get('type') == 'add' and 'expense' in table.get('table_name', '').lower():
            reasons.append("Expense data detected and table is expense-related")
        
        return "; ".join(reasons) if reasons else "Limited context available"


class ResponseFormatter:
    """Formats responses with intelligence indicators and recommendations."""
    
    @staticmethod
    def format_success(message: str, data: Any = None, steps: List[Dict] = None) -> str:
        """Format success response."""
        response = f"🎯 **Success:** {message}\n"
        
        if steps:
            response += ResponseFormatter._format_steps(steps)
        
        if data:
            response += ResponseFormatter._format_data(data)
        
        return response
    
    @staticmethod
    def format_error(message: str, error: str = None) -> str:
        """Format error response."""
        response = f"❌ **Error:** {message}"
        if error:
            response += f"\n   Details: {error}"
        return response
    
    @staticmethod
    def _format_steps(steps: List[Dict]) -> str:
        """Format operation steps."""
        formatted = "\n📋 **Steps:**\n"
        for step in steps:
            status_icon = {
                'completed': '✅',
                'in_progress': '⏳',
                'failed': '❌',
                'skipped': '⏭️'
            }.get(step.get('status'), '❓')
            
            formatted += f"{status_icon} Step {step.get('step', '?')}: {step.get('action', 'Unknown')}\n"
        
        return formatted
    
    @staticmethod
    def _format_data(data: Any) -> str:
        """Format data output."""
        if isinstance(data, list):
            return f"\n📊 **Found {len(data)} items**"
        elif isinstance(data, dict):
            return f"\n📦 **Data:** {json.dumps(data, indent=2)}"
        else:
            return f"\n📝 **Result:** {str(data)}"


import json
