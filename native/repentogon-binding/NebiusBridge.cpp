#include "NebiusBridge.h"

#include "IsaacRepentance.h"
#include "LuaCore.h"
#include "HookSystem.h"

#include <Windows.h>
#include <array>
#include <chrono>
#include <regex>
#include <thread>

namespace nebius {

namespace {
constexpr DWORD kIoTimeoutMs = 150;

bool WaitForOverlapped(HANDLE pipe, OVERLAPPED* operation, DWORD* transferred) {
    const DWORD result = WaitForSingleObject(operation->hEvent, kIoTimeoutMs);
    if (result != WAIT_OBJECT_0) {
        CancelIoEx(pipe, operation);
        WaitForSingleObject(operation->hEvent, INFINITE);
        return false;
    }
    return GetOverlappedResult(pipe, operation, transferred, FALSE) != FALSE;
}

bool RunIo(HANDLE pipe, bool write, void* buffer, DWORD length, DWORD* transferred) {
    OVERLAPPED operation{};
    operation.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!operation.hEvent) return false;

    const BOOL completed = write
        ? WriteFile(pipe, buffer, length, nullptr, &operation)
        : ReadFile(pipe, buffer, length, nullptr, &operation);
    bool ok = completed != FALSE;
    if (ok) ok = GetOverlappedResult(pipe, &operation, transferred, TRUE) != FALSE;
    else if (GetLastError() == ERROR_IO_PENDING) ok = WaitForOverlapped(pipe, &operation, transferred);

    CloseHandle(operation.hEvent);
    return ok;
}
} // namespace

BridgeClient::~BridgeClient() {
    _running = false;
    if (_worker.joinable()) _worker.join();
}

void BridgeClient::StartWorker() {
    bool expected = false;
    if (_running.compare_exchange_strong(expected, true)) {
        _worker = std::thread(&BridgeClient::WorkerMain, this);
    }
}

bool BridgeClient::Request(const std::string& request, std::string* response) {
    // This function is called only from WorkerMain, never Isaac's update/Lua thread.
    if (!WaitNamedPipeW(kPipeName, kIoTimeoutMs)) return false;
    HANDLE pipe = CreateFileW(kPipeName, GENERIC_READ | GENERIC_WRITE, 0, nullptr,
        OPEN_EXISTING, FILE_FLAG_OVERLAPPED, nullptr);
    if (pipe == INVALID_HANDLE_VALUE) return false;

    DWORD written = 0;
    const bool sent = RunIo(pipe, true, const_cast<char*>(request.data()), static_cast<DWORD>(request.size()), &written)
        && written == request.size();
    if (!sent) { CloseHandle(pipe); return false; }

    // The Node peer answers one bounded, newline-delimited frame, then closes.
    std::array<char, 65536> buffer{};
    DWORD read = 0;
    const bool received = RunIo(pipe, false, buffer.data(), static_cast<DWORD>(buffer.size() - 1), &read);
    CloseHandle(pipe);
    if (!received || read == 0 || read >= buffer.size()) return false;
    response->assign(buffer.data(), read);
    return true;
}

void BridgeClient::WorkerMain() {
    while (_running) {
        std::string request;
        {
            std::scoped_lock lock(_mutex);
            if (!_outgoingAcks.empty()) {
                request = std::move(_outgoingAcks.front());
                _outgoingAcks.pop_front();
            }
        }

        if (request.empty()) request = "{\"version\":1,\"type\":\"poll\"}\n";
        std::string response;
        if (Request(request, &response) && request.find("\"poll\"") != std::string::npos
            && response != "null\n" && response.size() <= 65536 && response.back() == '\n') {
            response.pop_back();
            std::scoped_lock lock(_mutex);
            if (_incoming.size() < kMaxQueuedMessages) _incoming.push_back(std::move(response));
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
}

std::optional<std::string> BridgeClient::Poll() {
    StartWorker();
    std::scoped_lock lock(_mutex);
    if (_incoming.empty()) return std::nullopt;
    std::string message = std::move(_incoming.front());
    _incoming.pop_front();
    return message;
}

bool BridgeClient::Ack(const std::string& id) {
    if (!std::regex_match(id, std::regex("[A-Za-z0-9_-]{1,100}"))) return false;
    StartWorker();
    std::scoped_lock lock(_mutex);
    if (_outgoingAcks.size() >= kMaxQueuedMessages) return false;
    _outgoingAcks.push_back("{\"version\":1,\"type\":\"ack\",\"id\":\"" + id + "\"}\n");
    return true;
}

} // namespace nebius

static nebius::BridgeClient g_nebiusBridge;

LUA_FUNCTION(Lua_NebiusBridgePoll) {
    const auto message = g_nebiusBridge.Poll();
    if (!message.has_value()) { lua_pushnil(L); return 1; }
    // Deliberately raw data. Lua must JSON-decode and validate it in fixed code.
    lua_pushlstring(L, message->data(), message->size());
    return 1;
}

LUA_FUNCTION(Lua_NebiusBridgeAck) {
    const char* id = luaL_checkstring(L, 1);
    lua_pushboolean(L, g_nebiusBridge.Ack(id));
    return 1;
}

static void RegisterNebiusBridge(lua_State* L) {
    lua_newtable(L);
    lua::TableAssoc(L, "Poll", Lua_NebiusBridgePoll);
    lua::TableAssoc(L, "Ack", Lua_NebiusBridgeAck);
    lua_setglobal(L, "NebiusBridge");
}

HOOK_METHOD(LuaEngine, RegisterClasses, () -> void) {
    super();
    lua::LuaStackProtector protector(_state);
    RegisterNebiusBridge(_state);
}
