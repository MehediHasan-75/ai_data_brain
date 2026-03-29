import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import JsonResponse

from ..user_auth.authentication import IsAuthenticatedCustom
from ..user_auth.permission import JWTAuthentication

from .models import DynamicTableData, JsonTable
from .serializers import DynamicTableSerializer
from .services import TableService, RowService, ColumnService, SharingService
from .exceptions import (
    FinanceException,
    TableNotFound,
    PermissionDenied,
    RowNotFound,
    DuplicateHeader,
    InvalidRowData,
    NotAFriend,
)

logger = logging.getLogger(__name__)


class DynamicTableListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def get(self, request):
        try:
            tables = TableService.list_tables(request.user)
            serializer = DynamicTableSerializer(tables, many=True)
            return Response({
                "message": "Dynamic tables fetched successfully.",
                "data": serializer.data,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DynamicTableUpdateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def put(self, request):
        try:
            data = request.data
            table, updated = TableService.update_table_metadata(
                request.user,
                data.get('id'),
                **{k: data[k] for k in ('table_name', 'description', 'pendingCount') if k in data},
            )
            if not updated:
                return Response(
                    {"message": "No valid fields provided to update."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response({
                "message": "Table updated successfully.",
                "data": DynamicTableSerializer(table).data,
            }, status=status.HTTP_200_OK)
        except TableNotFound as e:
            return Response({"message": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({
                "message": "An unexpected error occurred while updating the table.",
                "error": str(e),
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GetTableContentView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def get(self, request):
        try:
            result = TableService.get_all_tables_content(request.user)
            return JsonResponse(result, safe=False, status=status.HTTP_200_OK)
        except Exception as e:
            return JsonResponse(
                {"error": "Failed to fetch table data", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class AddRowView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        table_id = request.data.get("tableId")
        new_row = request.data.get("row")

        if not table_id or not isinstance(new_row, dict):
            return Response({
                "error": "Invalid input. 'tableId' must be provided and 'row' must be a dictionary."
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            row = RowService.add_row(request.user, table_id, new_row)
            return Response({
                "message": "Row added successfully.",
                "data": {"id": row.id, **new_row},
            }, status=status.HTTP_201_CREATED)
        except TableNotFound as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except InvalidRowData as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CreateTableWithHeadersView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        try:
            table_name = request.data.get("table_name")
            headers = request.data.get("headers", [])
            description = request.data.get("description", "")

            if not table_name or not headers:
                return Response(
                    {"error": "Table name and headers are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            table_data = TableService.create_table(
                request.user, table_name, description, headers
            )
            return Response({
                "message": "Table created successfully.",
                "data": {
                    "id": table_data.id,
                    "table_name": table_data.table_name,
                    "headers": table_data.jsontable.headers,
                    "created_at": table_data.created_at,
                    "description": table_data.description,
                },
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AddColumnView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        table_id = request.data.get("tableId")
        header = request.data.get("header")

        if not table_id or not header:
            return Response(
                {"error": "'tableId' and 'header' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            new_headers = ColumnService.add_column(request.user, table_id, header)
            return Response({
                "message": "Column added successfully.",
                "headers": new_headers,
            }, status=status.HTTP_200_OK)
        except TableNotFound as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except DuplicateHeader as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DeleteColumnView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        table_id = request.data.get("tableId")
        header = request.data.get("header")

        if not table_id or not isinstance(header, str):
            return Response(
                {"error": "'tableId' and 'header' (string) are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            new_headers = ColumnService.delete_column(request.user, table_id, header)
            return Response({
                "message": f"Column '{header}' deleted successfully.",
                "headers": new_headers,
            }, status=status.HTTP_200_OK)
        except TableNotFound as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except FinanceException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DeleteRowView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        table_id = request.data.get("tableId")
        row_id = request.data.get("rowId")

        if not table_id or row_id is None:
            return Response(
                {"error": "'tableId' and 'rowId' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            RowService.delete_row(request.user, table_id, row_id)
            return Response({"message": "Row deleted successfully."}, status=status.HTTP_200_OK)
        except TableNotFound as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except RowNotFound as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UpdateTableView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def patch(self, request, *args, **kwargs):
        table_id = request.data.get('tableId')
        row_id = request.data.get('rowId')
        new_row_data = request.data.get('newRowData')

        if not all([table_id, row_id, new_row_data]):
            return JsonResponse(
                {'error': 'Missing required fields: tableId, rowId, newRowData'},
                status=400,
            )

        try:
            row = RowService.update_row(request.user, table_id, row_id, new_row_data)
            return JsonResponse({'status': 'success', 'updated_row': row.data})
        except (TableNotFound, RowNotFound) as e:
            return JsonResponse({'error': str(e)}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


class DeleteTableView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def delete(self, request, table_id):
        try:
            table_name = TableService.delete_table(request.user, table_id)
            return Response({
                "message": f"Table '{table_name}' and all its data deleted successfully."
            }, status=status.HTTP_200_OK)
        except TableNotFound as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response(
                {"error": f"Failed to delete table: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class EditHeaderView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        table_id = request.data.get("tableId")
        old_header = request.data.get("oldHeader")
        new_header = request.data.get("newHeader")

        if not all([table_id, old_header, new_header]):
            return Response(
                {"error": "Missing required fields: tableId, oldHeader, newHeader"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            new_headers = ColumnService.rename_column(request.user, table_id, old_header, new_header)
            return Response({
                "message": "Header updated successfully.",
                "data": {"headers": new_headers},
            }, status=status.HTTP_200_OK)
        except TableNotFound as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except DuplicateHeader as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ShareTableView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        table_id = request.data.get('table_id')
        friend_ids = request.data.get('friend_ids', [])
        action = request.data.get('action')

        if not table_id or not action:
            return Response(
                {"error": "table_id and action are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if action == 'share':
                SharingService.share_table(request.user, table_id, friend_ids)
                message = "Table shared successfully."
            elif action == 'unshare':
                SharingService.unshare_table(request.user, table_id, friend_ids)
                message = "Table unshared successfully."
            else:
                return Response(
                    {"error": "Invalid action. Use 'share' or 'unshare'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            table = DynamicTableData.objects.get(id=table_id)
            return Response({
                "message": message,
                "table": {
                    "id": table.id,
                    "table_name": table.table_name,
                    "is_shared": table.is_shared,
                    "shared_with": [
                        {"id": f.id, "username": f.username}
                        for f in table.shared_with.all()
                    ],
                },
            }, status=status.HTTP_200_OK)
        except TableNotFound as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except NotAFriend as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except FinanceException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
